import { createHash, randomBytes } from "node:crypto";

type SessionPool = Readonly<{ query: (text: string, values: unknown[]) => Promise<Readonly<{ rows: Record<string, unknown>[] }>> }>;
export type AuthenticatedIdentity = Readonly<{ issuer: string; subject: string; mfaAssured: boolean }>;
export type LocalSession = Readonly<{ cookieValue: string; expiresAt: Date; identity: AuthenticatedIdentity }>;

function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

export async function createLocalSession(pool: SessionPool, identity: AuthenticatedIdentity): Promise<LocalSession> {
  if (!identity.mfaAssured || !identity.issuer || !identity.subject) throw new Error("Authentication is invalid.");
  const cookieValue = randomBytes(32).toString("base64url");
  const result = await pool.query("insert into app.admin_sessions (session_verifier_hash, issuer, subject, assurance, assurance_expires_at, idle_expires_at, absolute_expires_at, authorization_version) values ($1, $2, $3, 'MFA', current_timestamp + interval '8 hours', current_timestamp + interval '30 minutes', current_timestamp + interval '8 hours', (select authorization_version from app.admin_identities where issuer = $2 and subject = $3 and account_state = 'ACTIVE')) returning absolute_expires_at as \"absoluteExpiresAt\"", [hash(cookieValue), identity.issuer, identity.subject]);
  const expiresAt = result.rows[0]?.absoluteExpiresAt;
  if (!(expiresAt instanceof Date) && typeof expiresAt !== "string") throw new Error("Authentication is invalid.");
  return { cookieValue, expiresAt: new Date(expiresAt), identity };
}

export async function resolveLocalSession(pool: SessionPool, cookieValue: string): Promise<AuthenticatedIdentity | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(cookieValue)) return null;
  const result = await pool.query("select issuer, subject, assurance = 'MFA' as \"mfaAssured\" from app.admin_sessions where session_verifier_hash = $1 and revoked_at is null and assurance = 'MFA' and assurance_expires_at > current_timestamp and idle_expires_at > current_timestamp and absolute_expires_at > current_timestamp", [hash(cookieValue)]);
  const row = result.rows[0];
  if (!row || typeof row.issuer !== "string" || typeof row.subject !== "string" || row.mfaAssured !== true) return null;
  return { issuer: row.issuer, subject: row.subject, mfaAssured: true };
}
