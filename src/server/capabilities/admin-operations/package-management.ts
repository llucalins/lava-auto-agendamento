import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { withTransaction } from "../../persistence/transaction";
import { resolveAuthorizedSession } from "../admin-access/authorization";
import { writeAuditEvent } from "../audit-trail/writer";

const packageTermsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1_000).nullable(),
  priceCentavos: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  durationMinutes: z.number().int().min(1).max(480),
  state: z.enum(["ACTIVE", "INACTIVE"]),
}).strict();

const packageRevisionSchema = packageTermsSchema.extend({
  packageId: z.uuid(),
  expectedRevision: z.number().int().min(1),
}).strict();

export type AdminPackageTerms = z.input<typeof packageTermsSchema>;
export type AdminPackageRevision = z.input<typeof packageRevisionSchema>;
export type ManagedPackage = Readonly<{
  packageId: string;
  revision: number;
  name: string;
  description: string | null;
  priceCentavos: string;
  currency: "BRL";
  durationMinutes: number;
  state: "ACTIVE" | "INACTIVE";
}>;
export type PackageMutationResult = Readonly<{
  packageId: string;
  revision: number;
  state: "ACTIVE" | "INACTIVE";
  auditEventId: string;
}>;

type CurrentPackageRow = Readonly<{ currentRevision: number }>;
type PackageRevisionRow = Readonly<{
  name: string;
  description: string | null;
  priceCentavos: string;
  durationMinutes: number;
  state: "ACTIVE" | "INACTIVE";
}>;

export async function listAdminPackages(
  pool: Pick<Pool, "query">,
  sessionCookie: string,
  page = 1,
): Promise<readonly ManagedPackage[]> {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100) throw new Error("Forbidden");
  if (!(await resolveAuthorizedSession(pool, sessionCookie, "PACKAGE_MANAGE"))) throw new Error("Forbidden");
  const result = await pool.query<ManagedPackage>(
    `select package.package_id as "packageId", revision.revision,
            revision.name, revision.description,
            revision.price_centavos::text as "priceCentavos",
            'BRL'::text as currency, revision.duration_minutes as "durationMinutes",
            revision.state
     from app.service_packages package
     join app.service_package_revisions revision
       on revision.package_id = package.package_id
      and revision.revision = package.current_revision
     order by revision.name, package.package_id
     limit 50 offset $1`,
    [(page - 1) * 50],
  );
  return result.rows;
}

export async function createAdminPackage(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  terms: unknown,
): Promise<PackageMutationResult> {
  return withTransaction(pool, (client) => createAdminPackageInTransaction(client, sessionCookie, terms));
}

export async function createAdminPackageInTransaction(
  client: PoolClient,
  sessionCookie: string,
  terms: unknown,
): Promise<PackageMutationResult> {
  const parsed = packageTermsSchema.safeParse(terms);
  if (!parsed.success) throw new Error("Invalid package terms");
  const actor = await resolveAuthorizedSession(client, sessionCookie, "PACKAGE_MANAGE");
  if (!actor) throw new Error("Forbidden");

  const packageId = randomUUID();
  await client.query("insert into app.service_packages (package_id, current_revision) values ($1, 1)", [packageId]);
  await insertRevision(client, packageId, 1, parsed.data);
  const auditEventId = await writeAuditEvent(client, {
    category: "CONFIGURATION_MUTATION",
    action: "PACKAGE_CREATED",
    outcome: "SUCCEEDED",
    actorRef: actor.adminId,
    targetRef: packageId,
    reasonCode: "PACKAGE_INITIAL_TERMS_ESTABLISHED",
  });
  return { packageId, revision: 1, state: parsed.data.state, auditEventId };
}

export async function reviseAdminPackage(
  pool: Pick<Pool, "connect">,
  sessionCookie: string,
  command: unknown,
): Promise<PackageMutationResult> {
  return withTransaction(pool, (client) => reviseAdminPackageInTransaction(client, sessionCookie, command));
}

export async function reviseAdminPackageInTransaction(
  client: PoolClient,
  sessionCookie: string,
  command: unknown,
): Promise<PackageMutationResult> {
  const parsed = packageRevisionSchema.safeParse(command);
  if (!parsed.success) throw new Error("Invalid package terms");
  const actor = await resolveAuthorizedSession(client, sessionCookie, "PACKAGE_MANAGE");
  if (!actor) throw new Error("Forbidden");

  const packageResult = await client.query<CurrentPackageRow>(
    'select current_revision as "currentRevision" from app.service_packages where package_id = $1 for update',
    [parsed.data.packageId],
  );
  const currentRevision = packageResult.rows[0]?.currentRevision;
  if (currentRevision !== parsed.data.expectedRevision) throw new Error("Stale package revision");

  const currentResult = await client.query<PackageRevisionRow>(
    `select name, description, price_centavos::text as "priceCentavos",
            duration_minutes as "durationMinutes", state
     from app.service_package_revisions
     where package_id = $1 and revision = $2`,
    [parsed.data.packageId, currentRevision],
  );
  const current = currentResult.rows[0];
  if (!current) throw new Error("Stale package revision");
  if (hasSameTerms(current, parsed.data)) throw new Error("No package change requested");

  const revision = currentRevision + 1;
  await insertRevision(client, parsed.data.packageId, revision, parsed.data);
  const updated = await client.query(
    "update app.service_packages set current_revision = $2 where package_id = $1 and current_revision = $3 returning package_id",
    [parsed.data.packageId, revision, currentRevision],
  );
  if (updated.rows.length !== 1) throw new Error("Stale package revision");

  const highImpact = current.priceCentavos !== String(parsed.data.priceCentavos)
    || current.durationMinutes !== parsed.data.durationMinutes
    || current.state !== parsed.data.state;
  const auditEventId = await writeAuditEvent(client, {
    category: "CONFIGURATION_MUTATION",
    action: "PACKAGE_REVISION_PUBLISHED",
    outcome: "SUCCEEDED",
    actorRef: actor.adminId,
    targetRef: parsed.data.packageId,
    reasonCode: highImpact ? "PACKAGE_TERMS_OR_STATE_CHANGED" : "PACKAGE_PUBLIC_CONTENT_CHANGED",
  });
  return { packageId: parsed.data.packageId, revision, state: parsed.data.state, auditEventId };
}

async function insertRevision(
  client: PoolClient,
  packageId: string,
  revision: number,
  terms: AdminPackageTerms,
): Promise<void> {
  await client.query(
    `insert into app.service_package_revisions (
       package_id, revision, name, description, price_centavos, duration_minutes, state
     ) values ($1, $2, $3, $4, $5, $6, $7)`,
    [packageId, revision, terms.name, terms.description, terms.priceCentavos, terms.durationMinutes, terms.state],
  );
}

function hasSameTerms(current: PackageRevisionRow, next: AdminPackageTerms): boolean {
  return current.name === next.name
    && current.description === next.description
    && current.priceCentavos === String(next.priceCentavos)
    && current.durationMinutes === next.durationMinutes
    && current.state === next.state;
}
