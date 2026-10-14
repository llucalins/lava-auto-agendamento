import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { withTransaction } from "../../persistence/transaction";
import { resolveAuthorizedSession } from "../admin-access/authorization";
import { writeAuditEvent } from "../audit-trail/writer";

export const ESTABLISHMENT_PROFILE_ID = "00000000-0000-4000-8000-000000000001";

const updateSchema = z.object({
  expectedRevision: z.number().int().min(0),
  tradeName: z.string().trim().min(1).max(100),
  whatsapp: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/),
  address: z.string().trim().min(5).max(500),
}).strict();

type ProfileRow = Readonly<{
  revision: number;
  tradeName: string;
  whatsapp: string;
  address: string;
}>;

export type AdminEstablishmentProfile = ProfileRow;
export type PublicEstablishmentProfile = Pick<ProfileRow, "tradeName" | "whatsapp" | "address">;

type Queryable = Pick<Pool, "query">;

export async function getAdminEstablishmentProfile(
  pool: Queryable,
  sessionCookie: string,
): Promise<AdminEstablishmentProfile> {
  if (!(await resolveAuthorizedSession(pool, sessionCookie, "PACKAGE_MANAGE"))) throw new Error("Forbidden");
  const result = await pool.query<ProfileRow>(
    `select revision, trade_name as "tradeName", whatsapp, address
     from app.establishment_profile where establishment_id = $1`,
    [ESTABLISHMENT_PROFILE_ID],
  );
  const profile = result.rows[0];
  if (!profile) throw new Error("Establishment profile unavailable");
  return profile;
}

export async function getPublicEstablishmentProfile(pool: Queryable): Promise<PublicEstablishmentProfile | null> {
  const result = await pool.query<ProfileRow>(
    `select revision, trade_name as "tradeName", whatsapp, address
     from app.establishment_profile where establishment_id = $1`,
    [ESTABLISHMENT_PROFILE_ID],
  );
  const profile = result.rows[0];
  if (!profile || profile.revision === 0) return null;
  return { tradeName: profile.tradeName, whatsapp: profile.whatsapp, address: profile.address };
}

export async function updateEstablishmentProfile(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  command: unknown,
): Promise<AdminEstablishmentProfile> {
  return withTransaction(pool, (client) => updateEstablishmentProfileInTransaction(client, sessionCookie, command));
}

async function updateEstablishmentProfileInTransaction(
  client: PoolClient,
  sessionCookie: string,
  command: unknown,
): Promise<AdminEstablishmentProfile> {
  const parsed = updateSchema.safeParse(command);
  if (!parsed.success) throw new Error("Invalid establishment profile");
  const actor = await resolveAuthorizedSession(client, sessionCookie, "PACKAGE_MANAGE");
  if (!actor) throw new Error("Forbidden");

  const locked = await client.query<ProfileRow>(
    `select revision, trade_name as "tradeName", whatsapp, address
     from app.establishment_profile where establishment_id = $1 for update`,
    [ESTABLISHMENT_PROFILE_ID],
  );
  const current = locked.rows[0];
  if (!current || current.revision !== parsed.data.expectedRevision) throw new Error("Stale establishment profile revision");

  const updated = await client.query<ProfileRow>(
    `update app.establishment_profile
     set revision = revision + 1, trade_name = $2, whatsapp = $3, address = $4, updated_at = current_timestamp
     where establishment_id = $1
     returning revision, trade_name as "tradeName", whatsapp, address`,
    [ESTABLISHMENT_PROFILE_ID, parsed.data.tradeName, parsed.data.whatsapp, parsed.data.address],
  );
  const profile = updated.rows[0];
  if (!profile) throw new Error("Establishment profile unavailable");

  await writeAuditEvent(client, {
    category: "CONFIGURATION_MUTATION",
    action: "ESTABLISHMENT_PROFILE_UPDATED",
    outcome: "SUCCEEDED",
    actorRef: actor.adminId,
    targetRef: ESTABLISHMENT_PROFILE_ID,
    reasonCode: "ESTABLISHMENT_PUBLIC_PROFILE_UPDATED",
  });
  return profile;
}
