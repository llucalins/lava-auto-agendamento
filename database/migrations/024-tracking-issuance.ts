import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    alter table app.tracking_credentials
      add constraint tracking_credential_booking_reference unique (credential_id, booking_id);

    create table app.tracking_issuances (
      booking_id uuid primary key references app.bookings (booking_id) on delete restrict,
      state text not null,
      credential_id uuid not null unique,
      attempted_at timestamptz not null default current_timestamp,
      activated_at timestamptz not null default current_timestamp,
      issuance_version integer not null default 1,
      constraint tracking_issuance_state check (state = 'ACTIVE_RAW_NONRECOVERABLE'),
      constraint tracking_issuance_version check (issuance_version >= 1),
      constraint tracking_issuance_activation_order check (activated_at >= attempted_at),
      constraint tracking_issuance_credential foreign key (credential_id, booking_id)
        references app.tracking_credentials (credential_id, booking_id) on delete restrict
    );

    create function app.issue_initial_tracking_credential(
      p_credential_id uuid,
      p_booking_id uuid,
      p_verifier_key_version integer,
      p_credential_verifier text
    ) returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
    declare
      existing_credential_id uuid;
      activated_credential_id uuid;
    begin
      perform 1 from app.bookings b where b.booking_id = p_booking_id for update;
      if not found then raise exception 'Tracking issuance unavailable'; end if;

      if exists (select 1 from app.tracking_issuances i where i.booking_id = p_booking_id) then
        return false;
      end if;

      select c.credential_id
        into existing_credential_id
      from app.tracking_credentials c
      where c.booking_id = p_booking_id and c.state = 'ACTIVE';
      if existing_credential_id is not null then
        insert into app.tracking_issuances (booking_id, state, credential_id)
          values (p_booking_id, 'ACTIVE_RAW_NONRECOVERABLE', existing_credential_id);
        return false;
      end if;

      select created.credential_id
        into activated_credential_id
      from app.activate_tracking_credential(
        p_credential_id,
        p_booking_id,
        p_verifier_key_version,
        p_credential_verifier
      ) created;
      if activated_credential_id is null then raise exception 'Tracking issuance unavailable'; end if;

      insert into app.tracking_issuances (booking_id, state, credential_id)
        values (p_booking_id, 'ACTIVE_RAW_NONRECOVERABLE', activated_credential_id);
      return true;
    end;
    $function$;

    revoke all on function app.issue_initial_tracking_credential(uuid, uuid, integer, text) from public;
    grant execute on function app.issue_initial_tracking_credential(uuid, uuid, integer, text) to lava_test;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    revoke execute on function app.issue_initial_tracking_credential(uuid, uuid, integer, text) from lava_test;
    drop function app.issue_initial_tracking_credential(uuid, uuid, integer, text);
    drop table app.tracking_issuances;
    alter table app.tracking_credentials drop constraint tracking_credential_booking_reference;
  `);
}
