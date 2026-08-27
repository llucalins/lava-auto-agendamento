import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

type Pool = Readonly<{ query: (text: string, values: unknown[]) => Promise<Readonly<{ rows: Record<string, unknown>[] }>> }>;
const SESSION_COOKIE = "__Host-admin_session";

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export function issueCsrfToken(): string { return randomBytes(32).toString("base64url"); }

export async function bindCsrfToken(pool: Pool, sessionValue: string, token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionValue) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const result = await pool.query("update app.admin_sessions set csrf_token_hash = $1 where session_verifier_hash = $2 and revoked_at is null and assurance_expires_at > current_timestamp and idle_expires_at > current_timestamp and absolute_expires_at > current_timestamp returning session_verifier_hash", [digest(token), digest(sessionValue)]);
  return result.rows.length === 1;
}

export async function requireCsrf(request: Request, pool: Pool): Promise<boolean> {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) return true;
  const canonical = process.env.APP_ORIGIN;
  if (!canonical) return false;
  let origin: URL; let expectedOrigin: URL;
  try { origin = new URL(request.headers.get("origin") ?? ""); expectedOrigin = new URL(canonical); } catch { return false; }
  if (origin.origin !== expectedOrigin.origin || (process.env.NODE_ENV === "production" && expectedOrigin.protocol !== "https:")) return false;
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)__Host-admin_session=([^;]+)/)?.[1];
  const token = request.headers.get("x-csrf-token");
  if (!cookie || !token || !/^[A-Za-z0-9_-]{43}$/.test(cookie) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const result = await pool.query("select csrf_token_hash from app.admin_sessions where session_verifier_hash = $1 and csrf_token_hash is not null and revoked_at is null and assurance_expires_at > current_timestamp and idle_expires_at > current_timestamp and absolute_expires_at > current_timestamp", [digest(cookie)]);
  const stored = result.rows[0]?.csrf_token_hash;
  if (typeof stored !== "string") return false;
  return timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(digest(token), "hex"));
}

export function sessionCookieName(): string { return SESSION_COOKIE; }
