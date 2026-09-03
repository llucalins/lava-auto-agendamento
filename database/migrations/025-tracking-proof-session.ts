import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    alter table app.tracking_sessions add constraint tracking_session_short_lifetime
      check (expires_at <= issued_at + interval '15 minutes');

    create function app.establish_tracking_session(
      p_verifier_key_version integer,
      p_credential_verifier text,
      p_session_verifier text
    ) returns table(
      credential_id uuid,
      credential_version integer,
      booking_id uuid,
      expires_at timestamptz
    )
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
    declare
      authorized_credential_id uuid;
      authorized_credential_version integer;
      authorized_booking_id uuid;
      session_expiry timestamptz;
    begin
      if p_verifier_key_version < 1
        or p_credential_verifier !~ '^[a-f0-9]{64}$'
        or p_session_verifier !~ '^[a-f0-9]{64}$' then
        return;
      end if;
      select c.credential_id, c.credential_version, c.booking_id
        into authorized_credential_id, authorized_credential_version, authorized_booking_id
      from app.tracking_credentials c
      join app.bookings b on b.booking_id = c.booking_id
      where c.verifier_key_version = p_verifier_key_version
        and c.credential_verifier = p_credential_verifier
        and c.state = 'ACTIVE'
        and (
          (b.status in ('SCHEDULED', 'IN_PROGRESS') and b.terminal_transition_at is null and c.terminal_expires_at is null)
          or
          (b.status in ('COMPLETED', 'CANCELLED')
            and b.terminal_transition_at is not null
            and c.terminal_expires_at = b.terminal_transition_at + interval '7 days'
            and current_timestamp < c.terminal_expires_at)
        )
      for share of c, b;
      if not found then return; end if;

      session_expiry := current_timestamp + interval '15 minutes';
      insert into app.tracking_sessions (
        session_verifier, credential_id, credential_version, expires_at
      ) values (
        p_session_verifier, authorized_credential_id, authorized_credential_version, session_expiry
      );
      return query select authorized_credential_id, authorized_credential_version, authorized_booking_id, session_expiry;
    end;
    $function$;

    create function app.resolve_current_tracking_session(p_session_verifier text)
    returns table(credential_id uuid, credential_version integer, booking_id uuid)
    language sql
    stable
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

    revoke all on function app.establish_tracking_session(integer, text, text) from public;
    revoke all on function app.resolve_current_tracking_session(text) from public;
    grant execute on function app.establish_tracking_session(integer, text, text) to lava_test;
    grant execute on function app.resolve_current_tracking_session(text) to lava_test;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    revoke execute on function app.resolve_current_tracking_session(text) from lava_test;
    revoke execute on function app.establish_tracking_session(integer, text, text) from lava_test;
    drop function app.resolve_current_tracking_session(text);
    drop function app.establish_tracking_session(integer, text, text);
    alter table app.tracking_sessions drop constraint tracking_session_short_lifetime;
  `);
}
