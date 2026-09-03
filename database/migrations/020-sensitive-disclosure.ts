import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    alter table app.admin_sessions
      add column session_id uuid not null default gen_random_uuid(),
      add constraint admin_sessions_session_id_unique unique (session_id);

    create unique index audit_disclosure_request_unique
      on app.audit_events (action, idempotency_ref)
      where action = 'AUTHORIZED_FOR_DISCLOSURE' and idempotency_ref is not null;

    revoke select on app.booking_customer_vehicle_pii from lava_test;
    grant select (
      booking_id,
      service_mode,
      full_name,
      phone_whatsapp,
      email,
      vehicle_model,
      licence_plate,
      vehicle_color
    ) on app.booking_customer_vehicle_pii to lava_test;

    create function app.read_authorized_sensitive_field(
      p_session_verifier_hash text,
      p_booking_id uuid,
      p_field_ref text,
      p_correlation_id uuid,
      p_request_id uuid,
      p_purpose text
    ) returns table(field_ref text, field_value text)
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $function$
    declare
      authorized_admin_id uuid;
      authorized_session_id uuid;
    begin
      if p_field_ref not in ('CPF', 'PICKUP_ADDRESS') or p_purpose <> 'BOOKING_OPERATION' then
        return;
      end if;

      select identity.admin_id, session.session_id
        into authorized_admin_id, authorized_session_id
      from app.admin_identities identity
      join app.admin_sessions session
        on session.issuer = identity.issuer and session.subject = identity.subject
      where session.session_verifier_hash = p_session_verifier_hash
        and session.revoked_at is null
        and session.assurance = 'MFA'
        and session.assurance_expires_at > current_timestamp
        and session.idle_expires_at > current_timestamp
        and session.absolute_expires_at > current_timestamp
        and identity.account_state = 'ACTIVE'
        and session.authorization_version = identity.authorization_version
        and (
          (p_field_ref = 'CPF' and identity.role = 'OWNER')
          or
          (p_field_ref = 'PICKUP_ADDRESS' and identity.role in ('OWNER', 'EMPLOYEE'))
        )
      for share of identity, session;

      if not found then return; end if;

      perform 1
      from app.bookings booking
      where booking.booking_id = p_booking_id
      for key share;
      if not found then return; end if;

      perform 1
      from app.audit_events event
      where event.category = 'SENSITIVE_READ'
        and event.action = 'AUTHORIZED_FOR_DISCLOSURE'
        and event.outcome = 'SUCCEEDED'
        and event.actor_ref = authorized_admin_id::text
        and event.target_ref = p_booking_id::text
        and event.field_ref = p_field_ref
        and event.correlation_id = p_correlation_id
        and event.idempotency_ref = p_request_id::text
        and event.authorization_context_ref = authorized_session_id::text
        and event.reason_code = p_purpose;
      if not found then return; end if;

      if p_field_ref = 'CPF' then
        return query
          select 'CPF'::text, pii.cpf
          from app.booking_customer_vehicle_pii pii
          where pii.booking_id = p_booking_id;
      else
        return query
          select 'PICKUP_ADDRESS'::text, pii.pickup_address
          from app.booking_customer_vehicle_pii pii
          where pii.booking_id = p_booking_id and pii.pickup_address is not null;
      end if;
    end;
    $function$;

    revoke all on function app.read_authorized_sensitive_field(text, uuid, text, uuid, uuid, text) from public;
    grant execute on function app.read_authorized_sensitive_field(text, uuid, text, uuid, uuid, text) to lava_test;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    revoke execute on function app.read_authorized_sensitive_field(text, uuid, text, uuid, uuid, text) from lava_test;
    drop function app.read_authorized_sensitive_field(text, uuid, text, uuid, uuid, text);
    grant select on app.booking_customer_vehicle_pii to lava_test;
    drop index app.audit_disclosure_request_unique;
    alter table app.admin_sessions drop constraint admin_sessions_session_id_unique, drop column session_id;
  `);
}
