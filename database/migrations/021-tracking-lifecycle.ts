import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    alter table app.bookings add column terminal_transition_at timestamptz;
    update app.bookings
      set terminal_transition_at = current_timestamp
      where status in ('COMPLETED', 'CANCELLED');
    alter table app.bookings add constraint bookings_terminal_transition_state check (
      (status in ('COMPLETED', 'CANCELLED')) = (terminal_transition_at is not null)
    );

    create table app.tracking_credentials (
      credential_id uuid primary key,
      booking_id uuid not null references app.bookings (booking_id) on delete restrict,
      credential_version integer not null,
      verifier_key_version integer not null,
      credential_verifier char(64) not null,
      state text not null,
      terminal_expires_at timestamptz,
      issued_at timestamptz not null default current_timestamp,
      revoked_at timestamptz,
      replaced_by uuid references app.tracking_credentials (credential_id) on delete restrict,
      constraint tracking_credential_version_positive check (credential_version >= 1),
      constraint tracking_verifier_key_version_positive check (verifier_key_version >= 1),
      constraint tracking_credential_verifier_shape check (credential_verifier ~ '^[a-f0-9]{64}$'),
      constraint tracking_credential_state check (state in ('ACTIVE', 'REVOKED', 'REPLACED')),
      constraint tracking_credential_state_fields check (
        (state = 'ACTIVE' and revoked_at is null and replaced_by is null)
        or (state = 'REVOKED' and revoked_at is not null and replaced_by is null)
        or (state = 'REPLACED' and revoked_at is not null and replaced_by is not null)
      ),
      constraint tracking_credential_expiry_after_issue check (
        terminal_expires_at is null or terminal_expires_at > issued_at
      ),
      unique (booking_id, credential_version),
      unique (credential_id, credential_version),
      unique (verifier_key_version, credential_verifier)
    );
    create unique index tracking_one_active_credential_per_booking
      on app.tracking_credentials (booking_id)
      where state = 'ACTIVE';

    create table app.tracking_sessions (
      session_verifier char(64) primary key,
      credential_id uuid not null,
      credential_version integer not null,
      issued_at timestamptz not null default current_timestamp,
      expires_at timestamptz not null,
      revoked_at timestamptz,
      constraint tracking_session_verifier_shape check (session_verifier ~ '^[a-f0-9]{64}$'),
      constraint tracking_session_expiry check (expires_at > issued_at),
      constraint tracking_session_credential_version foreign key (credential_id, credential_version)
        references app.tracking_credentials (credential_id, credential_version) on delete restrict
    );

    create function app.apply_booking_terminal_tracking_expiry() returns trigger
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
    begin
      if new.status in ('COMPLETED', 'CANCELLED') then
        if tg_op = 'INSERT' or old.status not in ('COMPLETED', 'CANCELLED') then
          new.terminal_transition_at := coalesce(new.terminal_transition_at, current_timestamp);
        elsif new.terminal_transition_at is distinct from old.terminal_transition_at then
          raise exception 'Terminal transition timestamp is immutable';
        end if;
      elsif new.terminal_transition_at is not null then
        raise exception 'Non-terminal booking cannot have a terminal transition timestamp';
      end if;

      if tg_op = 'UPDATE'
        and old.status not in ('COMPLETED', 'CANCELLED')
        and new.status in ('COMPLETED', 'CANCELLED') then
        update app.tracking_credentials
          set terminal_expires_at = new.terminal_transition_at + interval '7 days'
          where booking_id = new.booking_id and state = 'ACTIVE';
      end if;
      return new;
    end;
    $function$;
    revoke all on function app.apply_booking_terminal_tracking_expiry() from public;
    create trigger booking_terminal_tracking_expiry
      before insert or update of status, terminal_transition_at on app.bookings
      for each row execute function app.apply_booking_terminal_tracking_expiry();

    create function app.activate_tracking_credential(
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
      select coalesce(max(c.credential_version), 0) + 1, b.terminal_transition_at
        into next_version, terminal_at
      from app.bookings b
      left join app.tracking_credentials c on c.booking_id = b.booking_id
      where b.booking_id = p_booking_id
      group by b.booking_id, b.terminal_transition_at
      for update of b;
      if not found then raise exception 'Tracking credential unavailable'; end if;
      if exists (select 1 from app.tracking_credentials c where c.booking_id = p_booking_id and c.state = 'ACTIVE') then
        raise exception 'Tracking credential unavailable';
      end if;
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

    create function app.replace_tracking_credential(
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
      update app.tracking_credentials
        set state = 'REVOKED', revoked_at = current_timestamp
        where credential_id = previous_id;
      update app.tracking_sessions
        set revoked_at = current_timestamp
        where credential_id = previous_id and credential_version = p_expected_version and revoked_at is null;
      insert into app.tracking_credentials (
        credential_id, booking_id, credential_version, verifier_key_version,
        credential_verifier, state, terminal_expires_at
      ) values (
        p_credential_id, p_booking_id, next_version, p_verifier_key_version,
        p_credential_verifier, 'ACTIVE',
        case when terminal_at is null then null else terminal_at + interval '7 days' end
      );
      update app.tracking_credentials
        set state = 'REPLACED', replaced_by = p_credential_id
        where credential_id = previous_id;
      return query select p_credential_id, next_version;
    end;
    $function$;

    create function app.revoke_tracking_credential(
      p_booking_id uuid,
      p_expected_version integer
    ) returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
    declare
      revoked_id uuid;
    begin
      update app.tracking_credentials
        set state = 'REVOKED', revoked_at = current_timestamp
        where booking_id = p_booking_id
          and credential_version = p_expected_version
          and state = 'ACTIVE'
        returning credential_id into revoked_id;
      if revoked_id is null then return false; end if;
      update app.tracking_sessions
        set revoked_at = current_timestamp
        where credential_id = revoked_id and credential_version = p_expected_version and revoked_at is null;
      return true;
    end;
    $function$;

    create function app.is_tracking_credential_version_current(
      p_credential_id uuid,
      p_credential_version integer
    ) returns boolean
    language sql
    stable
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
      select exists (
        select 1
        from app.tracking_credentials c
        join app.bookings b on b.booking_id = c.booking_id
        where c.credential_id = p_credential_id
          and c.credential_version = p_credential_version
          and c.state = 'ACTIVE'
          and (
            (b.status in ('SCHEDULED', 'IN_PROGRESS') and b.terminal_transition_at is null and c.terminal_expires_at is null)
            or
            (b.status in ('COMPLETED', 'CANCELLED')
              and b.terminal_transition_at is not null
              and c.terminal_expires_at = b.terminal_transition_at + interval '7 days'
              and current_timestamp < c.terminal_expires_at)
          )
      );
    $function$;

    revoke all on function app.activate_tracking_credential(uuid, uuid, integer, text) from public;
    revoke all on function app.replace_tracking_credential(uuid, integer, uuid, integer, text) from public;
    revoke all on function app.revoke_tracking_credential(uuid, integer) from public;
    revoke all on function app.is_tracking_credential_version_current(uuid, integer) from public;
    grant execute on function app.activate_tracking_credential(uuid, uuid, integer, text) to lava_test;
    grant execute on function app.replace_tracking_credential(uuid, integer, uuid, integer, text) to lava_test;
    grant execute on function app.revoke_tracking_credential(uuid, integer) to lava_test;
    grant execute on function app.is_tracking_credential_version_current(uuid, integer) to lava_test;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    revoke execute on function app.is_tracking_credential_version_current(uuid, integer) from lava_test;
    revoke execute on function app.revoke_tracking_credential(uuid, integer) from lava_test;
    revoke execute on function app.replace_tracking_credential(uuid, integer, uuid, integer, text) from lava_test;
    revoke execute on function app.activate_tracking_credential(uuid, uuid, integer, text) from lava_test;
    drop function app.is_tracking_credential_version_current(uuid, integer);
    drop function app.revoke_tracking_credential(uuid, integer);
    drop function app.replace_tracking_credential(uuid, integer, uuid, integer, text);
    drop function app.activate_tracking_credential(uuid, uuid, integer, text);
    drop trigger booking_terminal_tracking_expiry on app.bookings;
    drop function app.apply_booking_terminal_tracking_expiry();
    drop table app.tracking_sessions;
    drop table app.tracking_credentials;
    alter table app.bookings drop constraint bookings_terminal_transition_state, drop column terminal_transition_at;
  `);
}
