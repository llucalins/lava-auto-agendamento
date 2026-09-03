import type { Pool, PoolClient } from "pg";
import { z } from "zod";

type QueryBoundary = Pick<Pool | PoolClient, "query">;

const credentialSchema = z.object({
  bookingId: z.uuid(),
  credentialId: z.uuid(),
  verifierKeyVersion: z.number().int().min(1),
  credentialVerifier: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const lifecycleSchema = z.object({
  bookingId: z.uuid(),
  expectedVersion: z.number().int().min(1),
}).strict();

const versionSchema = z.object({
  credentialId: z.uuid(),
  credentialVersion: z.number().int().min(1),
}).strict();

export type StoredTrackingCredential = Readonly<{
  credentialId: string;
  credentialVersion: number;
}>;

export async function activateTrackingCredential(
  database: QueryBoundary,
  command: z.input<typeof credentialSchema>,
): Promise<StoredTrackingCredential> {
  const parsed = credentialSchema.safeParse(command);
  if (!parsed.success) throw unavailable();
  try {
    const result = await database.query<StoredTrackingCredential>(
      `select credential_id as "credentialId", credential_version as "credentialVersion"
       from app.activate_tracking_credential($1, $2, $3, $4)`,
      [parsed.data.credentialId, parsed.data.bookingId, parsed.data.verifierKeyVersion, parsed.data.credentialVerifier],
    );
    if (!result.rows[0]) throw unavailable();
    return result.rows[0];
  } catch {
    throw unavailable();
  }
}

export async function replaceTrackingCredential(
  database: QueryBoundary,
  command: z.input<typeof credentialSchema> & z.input<typeof lifecycleSchema>,
): Promise<StoredTrackingCredential> {
  const parsed = credentialSchema.and(lifecycleSchema).safeParse(command);
  if (!parsed.success) throw unavailable();
  try {
    const result = await database.query<StoredTrackingCredential>(
      `select credential_id as "credentialId", credential_version as "credentialVersion"
       from app.replace_tracking_credential($1, $2, $3, $4, $5)`,
      [parsed.data.bookingId, parsed.data.expectedVersion, parsed.data.credentialId, parsed.data.verifierKeyVersion, parsed.data.credentialVerifier],
    );
    if (!result.rows[0]) throw unavailable();
    return result.rows[0];
  } catch {
    throw unavailable();
  }
}

export async function revokeTrackingCredential(
  database: QueryBoundary,
  command: z.input<typeof lifecycleSchema>,
): Promise<void> {
  const parsed = lifecycleSchema.safeParse(command);
  if (!parsed.success) throw unavailable();
  try {
    const result = await database.query<{ revoked: boolean }>(
      'select app.revoke_tracking_credential($1, $2) as "revoked"',
      [parsed.data.bookingId, parsed.data.expectedVersion],
    );
    if (!result.rows[0]?.revoked) throw unavailable();
  } catch {
    throw unavailable();
  }
}

export async function isTrackingCredentialVersionCurrent(
  database: QueryBoundary,
  command: z.input<typeof versionSchema>,
): Promise<boolean> {
  const parsed = versionSchema.safeParse(command);
  if (!parsed.success) return false;
  const result = await database.query<{ current: boolean }>(
    'select app.is_tracking_credential_version_current($1, $2) as "current"',
    [parsed.data.credentialId, parsed.data.credentialVersion],
  );
  return result.rows[0]?.current === true;
}

function unavailable(): Error {
  return new Error("Tracking credential unavailable");
}
