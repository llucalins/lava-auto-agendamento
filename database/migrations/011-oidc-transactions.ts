import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable({ schema: "app", name: "oidc_login_transactions" }, {
    state_verifier: { type: "text", primaryKey: true }, nonce_verifier: { type: "text", notNull: true }, pkce_verifier: { type: "text", notNull: true }, redirect_target: { type: "text", notNull: true }, created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") }, expires_at: { type: "timestamptz", notNull: true }, consumed_at: { type: "timestamptz" },
  });
  pgm.addConstraint({ schema: "app", name: "oidc_login_transactions" }, "oidc_login_transaction_bounds", { check: "length(state_verifier) between 43 and 128 and length(nonce_verifier) between 43 and 128 and length(pkce_verifier) between 43 and 128 and redirect_target like 'https://%' and expires_at > created_at and expires_at <= created_at + interval '10 minutes'" });
  pgm.sql("grant insert, select, update on app.oidc_login_transactions to lava_test");
}

export function down(pgm: MigrationBuilder): void { pgm.dropTable({ schema: "app", name: "oidc_login_transactions" }); }
