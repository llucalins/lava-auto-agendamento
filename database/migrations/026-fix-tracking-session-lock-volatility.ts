import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    create or replace function app.resolve_current_tracking_session(p_session_verifier text)
    returns table(credential_id uuid, credential_version integer, booking_id uuid)
    language sql
    volatile
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
      select c.credential_id, c.credential_version, c.booking_id
      from app.tracking_sessions s
      join app.tracking_credentials c
        on c.credential_id = s.credential_id and c.credential_version = s.credential_version
      join app.bookings b on b.booking_id = c.booking_id
      where s.session_verifier = p_session_verifier
        and s.revoked_at is null
        and s.expires_at > current_timestamp
        and c.state = 'ACTIVE'
        and (
          (b.status in ('SCHEDULED', 'IN_PROGRESS') and b.terminal_transition_at is null and c.terminal_expires_at is null)
          or
          (b.status in ('COMPLETED', 'CANCELLED')
            and b.terminal_transition_at is not null
            and c.terminal_expires_at = b.terminal_transition_at + interval '7 days'
            and current_timestamp < c.terminal_expires_at)
        )
      for share of s, c, b;
    $function$;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("alter function app.resolve_current_tracking_session(text) stable");
}
