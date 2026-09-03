import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    create or replace function app.activate_tracking_credential(
      p_credential_id uuid,
      p_booking_id uuid,
      p_verifier_key_version integer,
      p_credential_verifier text
    ) returns table(credential_id uuid, credential_version integer)
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
    declare
      next_version integer;
      terminal_at timestamptz;
    begin
      if p_verifier_key_version < 1 or p_credential_verifier !~ '^[a-f0-9]{64}$' then
        raise exception 'Invalid tracking credential verifier';
      end if;
      select b.terminal_transition_at
        into terminal_at
      from app.bookings b
      where b.booking_id = p_booking_id
      for update;
      if not found then raise exception 'Tracking credential unavailable'; end if;
      if exists (select 1 from app.tracking_credentials c where c.booking_id = p_booking_id and c.state = 'ACTIVE') then
        raise exception 'Tracking credential unavailable';
      end if;
      select coalesce(max(c.credential_version), 0) + 1
        into next_version
      from app.tracking_credentials c
      where c.booking_id = p_booking_id;
      insert into app.tracking_credentials (
        credential_id, booking_id, credential_version, verifier_key_version,
        credential_verifier, state, terminal_expires_at
      ) values (
        p_credential_id, p_booking_id, next_version, p_verifier_key_version,
        p_credential_verifier, 'ACTIVE',
        case when terminal_at is null then null else terminal_at + interval '7 days' end
      );
      return query select p_credential_id, next_version;
    end;
    $function$;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    create or replace function app.activate_tracking_credential(
      p_credential_id uuid,
      p_booking_id uuid,
      p_verifier_key_version integer,
      p_credential_verifier text
    ) returns table(credential_id uuid, credential_version integer)
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
    declare
      next_version integer;
      terminal_at timestamptz;
    begin
      select coalesce(max(c.credential_version), 0) + 1, b.terminal_transition_at
        into next_version, terminal_at
      from app.bookings b
      left join app.tracking_credentials c on c.booking_id = b.booking_id
      where b.booking_id = p_booking_id
      group by b.booking_id, b.terminal_transition_at
      for update of b;
      return query select p_credential_id, next_version;
    end;
    $function$;
  `);
}
