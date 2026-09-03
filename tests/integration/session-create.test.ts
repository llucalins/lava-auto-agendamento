import { afterAll, describe, expect, it } from "vitest";
import { createLocalSession, resolveLocalSession } from "../../src/server/capabilities/admin-access/sessions";
import { withTransaction } from "../../src/server/persistence/transaction";
import { createIntegrationPool } from "../support/postgres";

const pool = createIntegrationPool();
afterAll(async () => { await pool.end(); });

describe("local PostgreSQL session contract", () => {
  it("persists only a verifier and resolves the opaque cookie to identity", async () => {
    await withTransaction(pool, async (client) => {
      const session = await createLocalSession(client, { issuer: "https://id.example.test", subject: "subject-1", mfaAssured: true });
      expect(session.cookieValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(session.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      await expect(resolveLocalSession(client, session.cookieValue)).resolves.toEqual({ issuer: "https://id.example.test", subject: "subject-1", mfaAssured: true });
      const stored = await client.query("select session_verifier_hash, csrf_token_hash from app.admin_sessions where issuer = $1 and subject = $2", ["https://id.example.test", "subject-1"]);
      expect(stored.rows[0].session_verifier_hash).not.toBe(session.cookieValue);
      expect(stored.rows[0].csrf_token_hash).not.toBe(session.csrfToken);
    });
  });

  it("rejects unauthoritative or non-MFA identities before persistence", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    await expect(createLocalSession(pool, { issuer: "https://id.example.test", subject: "subject-1", mfaAssured: false })).rejects.toThrow();
  });
});
