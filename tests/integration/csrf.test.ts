import { afterAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { bindCsrfToken, issueCsrfToken, requireCsrf } from "../../src/server/security/csrf";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createIntegrationPool } from "../support/postgres";

const pool = createIntegrationPool();
afterAll(async () => { await pool.end(); });

describe("admin CSRF policy", () => {
  it("requires exact Origin and a PostgreSQL-bound synchronizer token", async () => {
    const previous = process.env.APP_ORIGIN; process.env.APP_ORIGIN = "https://admin.example.test";
    try { await withTransaction(pool, async (client) => {
      const session = randomBytes(32).toString("base64url"); const token = issueCsrfToken();
      const sessionHash = createHash("sha256").update(session).digest("hex");
      await client.query("insert into app.admin_sessions (session_verifier_hash, issuer, subject, assurance, authenticated_at, assurance_expires_at, idle_expires_at, absolute_expires_at) values ($1, 'https://id.example.test', 'csrf-test', 'MFA', current_timestamp - interval '1 minute', current_timestamp + interval '7 hours', current_timestamp + interval '20 minutes', current_timestamp + interval '7 hours')", [sessionHash]);
      expect(await bindCsrfToken(client, session, token)).toBe(true);
      expect(await requireCsrf(new Request("https://admin.example.test/admin", { method: "POST", headers: { origin: "https://admin.example.test", cookie: `__Host-admin_session=${session}`, "x-csrf-token": token } }), client)).toBe(true);
      expect(await requireCsrf(new Request("https://admin.example.test/admin", { method: "POST", headers: { origin: "https://evil.example.test", cookie: `__Host-admin_session=${session}`, "x-csrf-token": token } }), client)).toBe(false);
    }); } finally { process.env.APP_ORIGIN = previous; }
  });
});
