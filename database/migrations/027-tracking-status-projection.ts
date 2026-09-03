import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    create function app.read_current_tracking_status(p_session_verifier text)
    returns table(status text)
    language sql
    volatile
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
      select b.status
      from app.tracking_sessions s
      join app.tracking_credentials c
        on c.credential_id = s.credential_id and c.credential_version = s.credential_version
      join app.bookings b on b.booking_id = c.booking_id
      where p_session_verifier ~ '^[a-f0-9]{64}$'
        and s.session_verifier = p_session_verifier
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

    revoke all on function app.read_current_tracking_status(text) from public;
    grant execute on function app.read_current_tracking_status(text) to lava_test;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    revoke execute on function app.read_current_tracking_status(text) from lava_test;
    drop function app.read_current_tracking_status(text);
  `);
}
