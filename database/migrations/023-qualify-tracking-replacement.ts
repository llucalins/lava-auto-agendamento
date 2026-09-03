import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    create or replace function app.replace_tracking_credential(
      p_booking_id uuid,
      p_expected_version integer,
      p_credential_id uuid,
      p_verifier_key_version integer,
      p_credential_verifier text
    ) returns table(credential_id uuid, credential_version integer)
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
    declare
      previous_id uuid;
      terminal_at timestamptz;
      next_version integer;
    begin
      if p_expected_version < 1 or p_verifier_key_version < 1 or p_credential_verifier !~ '^[a-f0-9]{64}$' then
        raise exception 'Invalid tracking credential verifier';
      end if;
      select c.credential_id, b.terminal_transition_at
        into previous_id, terminal_at
      from app.bookings b
      join app.tracking_credentials c on c.booking_id = b.booking_id
      where b.booking_id = p_booking_id
        and c.credential_version = p_expected_version
        and c.state = 'ACTIVE'
      for update of b, c;
      if not found then raise exception 'Tracking credential unavailable'; end if;
      next_version := p_expected_version + 1;
      update app.tracking_credentials c
        set state = 'REVOKED', revoked_at = current_timestamp
        where c.credential_id = previous_id;
      update app.tracking_sessions s
        set revoked_at = current_timestamp
        where s.credential_id = previous_id
          and s.credential_version = p_expected_version
          and s.revoked_at is null;
      insert into app.tracking_credentials (
        credential_id, booking_id, credential_version, verifier_key_version,
        credential_verifier, state, terminal_expires_at
      ) values (
        p_credential_id, p_booking_id, next_version, p_verifier_key_version,
        p_credential_verifier, 'ACTIVE',
        case when terminal_at is null then null else terminal_at + interval '7 days' end
      );
      update app.tracking_credentials c
        set state = 'REPLACED', replaced_by = p_credential_id
        where c.credential_id = previous_id;
      return query select p_credential_id, next_version;
    end;
    $function$;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("select 1");
}
