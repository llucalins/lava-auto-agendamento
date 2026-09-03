import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { z } from "zod";

const bookingIdSchema = z.uuid();
const keyVersionSchema = z.number().int().min(1);

export type TrackingVerifierKey = Readonly<{
  keyVersion: number;
  verifierKey: Buffer;
}>;

export type TrackingIssuanceResult =
  | Readonly<{ kind: "ISSUED"; credential: string }>
  | Readonly<{ kind: "RAW_NONRECOVERABLE" }>;

export async function issueInitialTrackingCredential(
  pool: Pick<Pool, "query">,
  bookingId: string,
  key: TrackingVerifierKey,
): Promise<TrackingIssuanceResult> {
  const parsedBookingId = bookingIdSchema.safeParse(bookingId);
  const parsedKeyVersion = keyVersionSchema.safeParse(key.keyVersion);
  if (!parsedBookingId.success || !parsedKeyVersion.success || key.verifierKey.length < 32) {
    throw unavailable();
  }

  const credential = randomBytes(32).toString("base64url");
  const verifier = createHmac("sha256", key.verifierKey).update(credential).digest("hex");
  try {
    const result = await pool.query<{ issued: boolean }>(
      'select app.issue_initial_tracking_credential($1, $2, $3, $4) as "issued"',
      [randomUUID(), parsedBookingId.data, parsedKeyVersion.data, verifier],
    );
    return result.rows[0]?.issued === true
      ? { kind: "ISSUED", credential }
      : { kind: "RAW_NONRECOVERABLE" };
  } catch {
    throw unavailable();
  }
}

export function loadTrackingVerifierKey(
  environment: Readonly<Record<string, string | undefined>>,
): TrackingVerifierKey {
  const keyVersion = Number(environment.TRACKING_VERIFIER_KEY_VERSION);
  const encoded = environment.TRACKING_VERIFIER_KEY;
  if (!Number.isInteger(keyVersion) || keyVersion < 1 || !encoded || !/^[A-Za-z0-9_-]{43,}$/.test(encoded)) {
    throw unavailable();
  }
  const verifierKey = Buffer.from(encoded, "base64url");
  if (verifierKey.length < 32) throw unavailable();
  return { keyVersion, verifierKey };
}

function unavailable(): Error {
  return new Error("Tracking issuance unavailable");
}
