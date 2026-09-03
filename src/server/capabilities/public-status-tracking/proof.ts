import { createHash, createHmac, randomBytes } from "node:crypto";

import type { Pool } from "pg";

import type { TrackingVerifierKey } from "./issuance";

const credentialPattern = /^[A-Za-z0-9_-]{43}$/;
const sessionPattern = /^[A-Za-z0-9_-]{43}$/;
const dummyCredential = "A".repeat(43);

export type TrackingSession = Readonly<{
  cookieValue: string;
  expiresAt: Date;
}>;

export type TrackingSessionBinding = Readonly<{
  credentialId: string;
  credentialVersion: number;
  bookingId: string;
}>;

export async function proveTrackingCredential(
  pool: Pick<Pool, "query">,
  credential: string,
  key: TrackingVerifierKey,
): Promise<TrackingSession | null> {
  validateKey(key);
  const validShape = typeof credential === "string" && credentialPattern.test(credential);
  const verifier = createHmac("sha256", key.verifierKey)
    .update(validShape ? credential : dummyCredential)
    .digest("hex");
  const cookieValue = randomBytes(32).toString("base64url");
  const sessionVerifier = digest(cookieValue);
  try {
    const result = await pool.query<{ expiresAt: Date }>(
      `select expires_at as "expiresAt"
       from app.establish_tracking_session($1, $2, $3)`,
      [key.keyVersion, verifier, sessionVerifier],
    );
    if (!validShape || !result.rows[0]) return null;
    return { cookieValue, expiresAt: result.rows[0].expiresAt };
  } catch {
    throw new Error("Tracking proof unavailable");
  }
}

export async function resolveTrackingSession(
  pool: Pick<Pool, "query">,
  cookieValue: string,
): Promise<TrackingSessionBinding | null> {
  if (!sessionPattern.test(cookieValue)) return null;
  const result = await pool.query<TrackingSessionBinding>(
    `select credential_id as "credentialId", credential_version as "credentialVersion", booking_id as "bookingId"
     from app.resolve_current_tracking_session($1)`,
    [digest(cookieValue)],
  );
  return result.rows[0] ?? null;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateKey(key: TrackingVerifierKey): void {
  if (!Number.isInteger(key.keyVersion) || key.keyVersion < 1 || key.verifierKey.length < 32) {
    throw new Error("Tracking proof unavailable");
  }
}
