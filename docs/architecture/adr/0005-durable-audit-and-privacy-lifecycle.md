# ADR-0005: Use durable audit and privacy lifecycle boundaries

## Status

Accepted

## Context

High-impact administration and sensitive CPF/pickup-address reads require durable, privacy-minimized accountability. The system also has fixed operational PII/audit retention decisions and strict no-leakage requirements.

CPF is ordinary personal data under LGPD and an internal high-risk PII classification, not statutory sensitive personal data. Its MVP collection is a product requirement, not a claim that it is universally legally or fiscally required at booking.

## Decision

For high-impact administrative mutations, commit the domain effect and required minimized audit event in the same PostgreSQL transaction when they share a consistency boundary. Do not report success unless the durable outcome is recoverable. Audit must not record `SUCCEEDED` for an uncommitted mutation, and retries must not duplicate the mutation.

For CPF/pickup-address disclosure, authorize without selecting raw PII, then durably commit a minimized, idempotent `AUTHORIZED_FOR_DISCLOSURE` event before any raw sensitive read. After that acceptance, the dedicated sensitive-field projection must be conditional on a coherent, current authorization state: valid session, active account, required MFA assurance, current permissions/field permission, actor/action/resource/field authorization, and authorization/version state.

The final conditional sensitive read is the authorization linearization point. Concurrent security reductions coordinate through the same authoritative authorization/version state. If authorization fails or state/audit outcome is ambiguous, fail closed without fetching or returning raw PII; successful output uses private/no-store behavior.

`AUTHORIZED_FOR_DISCLOSURE` records durable authorization for a potential disclosure. It does not claim raw PII was fetched, the final gate passed, a response was delivered, or an administrator read the value.

## Privacy lifecycle consequences

- Retain active-booking PII only as required to deliver service.
- Retain terminal operational booking PII for 12 months after authoritative terminal transition, then delete or irreversibly anonymize it absent another valid purpose.
- Retain minimized audit records for 24 months.
- Fiscal data has a separate, minimized purpose/lifecycle and does not preserve the complete operational booking record by default.
- Backups have finite retention; after restoration, reapply previously required deletion/anonymization before normal operation resumes.

## Observability and cache consequences

No raw CPF, address, phone, email, licence plate, authentication/session/tracking secret, authorization header, or sensitive request/response body may enter logs, audit payloads, analytics, telemetry, APM, errors, proxy/CDN logs, or similar observability systems. Sensitive routes require explicit private/no-store handling.

## Alternatives considered

- **Best-effort asynchronous audit for durable operations:** rejected because it permits unknown divergence between mutation/disclosure and audit acceptance.
- **Preloading sensitive aggregate data before audit acceptance:** rejected because it violates the approved disclosure boundary.
- **Audit records as PII replicas:** rejected because audit needs minimized accountability rather than raw sensitive data.

## Open follow-up decisions

Define exact audit schema, append-only permission design, authorization-version coordination, retention-job operation, backup duration, cache-header syntax, and provider/observability contracts.

## References

- [Audit trail](../../../SPEC-audit-trail.md)
- [Privacy governance](../../../SPEC-privacy-governance.md)
- [Admin access](../../../SPEC-admin-access.md)
- [Admin operations](../../../SPEC-admin-operations.md)
