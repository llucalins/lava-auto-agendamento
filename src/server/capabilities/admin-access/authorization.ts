import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { writeAuditEvent } from "../audit-trail/writer";
import { withTransaction } from "../../persistence/transaction";

export const PERMISSIONS = ["BOOKING_READ", "BOOKING_STATUS_UPDATE", "BOOKING_CANCEL", "PACKAGE_MANAGE", "CALENDAR_MANAGE", "PICKUP_ADDRESS_REVEAL", "CPF_REVEAL", "AUDIT_READ", "ADMIN_IDENTITY_MANAGE"] as const;
export type Permission = typeof PERMISSIONS[number];
export type AdminRole = "OWNER" | "EMPLOYEE";
export type Identity = Readonly<{ adminId: string; role: string; accountState: string; authorizationVersion: number }>;

const OWNER = new Set<Permission>(PERMISSIONS);
const EMPLOYEE = new Set<Permission>(["BOOKING_READ", "BOOKING_STATUS_UPDATE", "BOOKING_CANCEL", "PICKUP_ADDRESS_REVEAL"]);

export function hasPermission(identity: Identity | null | undefined, permission: string): boolean {
  if (!identity || identity.accountState !== "ACTIVE" || !Number.isSafeInteger(identity.authorizationVersion) || identity.authorizationVersion < 1 || !PERMISSIONS.includes(permission as Permission)) return false;
  return (identity.role === "OWNER" ? OWNER : identity.role === "EMPLOYEE" ? EMPLOYEE : new Set()).has(permission as Permission);
}

export function canRevealField(identity: Identity | null | undefined, field: "CPF" | "PICKUP_ADDRESS"): boolean { return hasPermission(identity, field === "CPF" ? "CPF_REVEAL" : "PICKUP_ADDRESS_REVEAL"); }
export function canChangeIdentity(actor: Identity | null | undefined, targetAdminId: string, removingOwner: boolean, activeOwnerCount: number): boolean { return !!actor && hasPermission(actor, "ADMIN_IDENTITY_MANAGE") && actor.adminId !== targetAdminId && (!removingOwner || activeOwnerCount > 1); }

type AuthorizationPool = Pick<Pool, "query">;
type MutationPool = Pick<Pool, "connect">;
type IdentityChange = Readonly<{ actorAdminId: string; targetAdminId: string; role: AdminRole; accountState: "ACTIVE" | "DISABLED" }>;
type DatabaseIdentity = Readonly<{ adminId: string; role: string; accountState: string; authorizationVersion: string | number }>;

const identityChangeSchema = z.object({ actorAdminId: z.uuid(), targetAdminId: z.uuid(), role: z.enum(["OWNER", "EMPLOYEE"]), accountState: z.enum(["ACTIVE", "DISABLED"]) }).strict();

function toIdentity(row: DatabaseIdentity | undefined): Identity | null {
  if (!row) return null;
  const version = typeof row.authorizationVersion === "string" ? Number(row.authorizationVersion) : row.authorizationVersion;
  return typeof row.adminId === "string" && typeof row.role === "string" && typeof row.accountState === "string" && Number.isSafeInteger(version)
    ? { adminId: row.adminId, role: row.role, accountState: row.accountState, authorizationVersion: version }
    : null;
}

export async function resolveAuthorizedSession(pool: AuthorizationPool, cookieValue: string, permission: Permission): Promise<Identity | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(cookieValue) || !PERMISSIONS.includes(permission)) return null;
  const { createHash } = await import("node:crypto");
  const sessionHash = createHash("sha256").update(cookieValue, "utf8").digest("hex");
  const result = await pool.query("select i.admin_id as \"adminId\", i.role, i.account_state as \"accountState\", i.authorization_version as \"authorizationVersion\" from app.admin_sessions s join app.admin_identities i on i.issuer = s.issuer and i.subject = s.subject where s.session_verifier_hash = $1 and s.revoked_at is null and s.assurance = 'MFA' and s.assurance_expires_at > current_timestamp and s.idle_expires_at > current_timestamp and s.absolute_expires_at > current_timestamp and s.authorization_version = i.authorization_version", [sessionHash]);
  const identity = toIdentity(result.rows[0]);
  return hasPermission(identity, permission) ? identity : null;
}

export async function changeAdminIdentity(pool: MutationPool, change: IdentityChange): Promise<Readonly<{ auditEventId: string; authorizationVersion: number }>> {
  return withTransaction(pool, (client) => changeAdminIdentityInTransaction(client, change));
}

export async function changeAdminIdentityInTransaction(client: PoolClient, change: IdentityChange): Promise<Readonly<{ auditEventId: string; authorizationVersion: number }>> {
  const input = identityChangeSchema.parse(change);
  await client.query("select pg_advisory_xact_lock(270014)");
  const identities = await client.query<DatabaseIdentity>("select admin_id as \"adminId\", role, account_state as \"accountState\", authorization_version as \"authorizationVersion\" from app.admin_identities where admin_id = any($1::uuid[]) order by admin_id for update", [[input.actorAdminId, input.targetAdminId]]);
  const byId = new Map(identities.rows.map((row) => [row.adminId, toIdentity(row)]));
  const actor = byId.get(input.actorAdminId) ?? null;
  const target = byId.get(input.targetAdminId) ?? null;
  if (!actor || !target || !hasPermission(actor, "ADMIN_IDENTITY_MANAGE") || actor.adminId === target.adminId) throw new Error("Forbidden");
  const removesOwner = target.role === "OWNER" && target.accountState === "ACTIVE" && (input.role !== "OWNER" || input.accountState !== "ACTIVE");
  if (removesOwner) {
    const count = await client.query<{ count: string }>("select count(*)::text as count from app.admin_identities where role = 'OWNER' and account_state = 'ACTIVE'");
    if (Number(count.rows[0]?.count) <= 1) throw new Error("Forbidden");
  }
  if (target.role === input.role && target.accountState === input.accountState) throw new Error("No authorization change requested");
  const updated = await client.query<DatabaseIdentity>("update app.admin_identities set role = $2, account_state = $3, authorization_version = authorization_version + 1 where admin_id = $1 returning admin_id as \"adminId\", role, account_state as \"accountState\", authorization_version as \"authorizationVersion\"", [target.adminId, input.role, input.accountState]);
  const newIdentity = toIdentity(updated.rows[0]);
  if (!newIdentity) throw new Error("Authorization update failed");
  await client.query("update app.admin_sessions set revoked_at = current_timestamp where issuer = (select issuer from app.admin_identities where admin_id = $1) and subject = (select subject from app.admin_identities where admin_id = $1) and revoked_at is null", [target.adminId]);
  const auditEventId = await writeAuditEvent(client, { category: "AUTHORIZATION", action: "ADMIN_IDENTITY_CHANGED", outcome: "SUCCEEDED", actorRef: actor.adminId, targetRef: target.adminId, reasonCode: removesOwner ? "OWNER_PRIVILEGE_REDUCED" : "IDENTITY_PRIVILEGE_CHANGED" });
  return { auditEventId, authorizationVersion: newIdentity.authorizationVersion };
}
