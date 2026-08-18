# Spec: audit-trail

## Status

Draft for human review. This is the Phase 1 specification for `audit-trail` only. It does not authorize planning, implementation, or specification of `admin-access`, `booking-lifecycle`, `admin-operations`, or another module.

## Objective

Define a minimal, stable security/audit event contract that provides accountability for security-relevant and sensitive administrative activity while preserving privacy. The contract must be consumable later by `admin-access`, `booking-lifecycle`, and `admin-operations` without coupling audit records to application logs, request/response payloads, database records, a framework, database, vendor, cloud provider, or storage technology.

## Scope

This specification defines:

- The minimum event contract, its permitted data, and prohibited data.
- Event categories for authentication, authorization, sensitive reads, sensitive mutations, and security-relevant failures.
- Append-only, tamper-resistance, access-control, privacy, retention, backup, availability, failure-mode, and verification requirements.
- The risk-based policy for whether an operation can proceed when durable audit persistence is unavailable.

## Non-goals

- Choosing audit storage, database, transport, logging/observability vendor, cloud provider, framework, or implementation pattern.
- Defining administrative authentication, booking, status-transition, package, calendar, or authorization implementation details.
- Making audit records a general event bus, analytics data source, support log, customer-history view, or PII archive.
- Defining statutory retention periods, legal bases, consent requirements, or Brazilian compliance conclusions.

## Trust boundary

`audit-trail` is a security boundary between modules that perform sensitive actions and the durable accountability record for those actions.

- Producers (`admin-access`, `booking-lifecycle`, and `admin-operations`) provide only a validated, allowlisted event envelope.
- The audit boundary must reject malformed events and fields outside the contract; it must not accept arbitrary metadata, complete request/response bodies, or record snapshots.
- Ordinary administrative users must not edit, delete, rewrite, or directly manage audit records.
- Read access is itself sensitive and is restricted to explicitly authorized roles and purposes. It must not expose raw PII merely because an event refers to a customer or booking.
- Audit events and normal application logs are separate concerns. An application log is not a substitute for an audit event, and an audit record is not a substitute for diagnostic logging.

## Trusted event authority

- Producers are trusted application boundaries, but the audit boundary must still validate every event envelope against the contract.
- Actor identity must be derived from or verified against trusted server-side authentication or service context; it must never be accepted directly from client-controlled input.
- Action and category must originate from an allowlisted server-side contract, not client-controlled labels or free text.
- Outcome must be determined by the authoritative server-side operation; a client must never claim a successful outcome, another actor, a privilege, or a security event.
- `occurredAt` must be server-authoritative.
- Client input may be referenced only through explicitly approved, minimized server-side interpretation; it must never become authoritative audit security data.

## Event categories

| Category | Required event coverage | Examples |
|---|---|---|
| `AUTHENTICATION` | Attempts and security-relevant session/account events | Authentication success/failure, account recovery attempt, session invalidation, session-security anomaly |
| `AUTHORIZATION` | Permission and privilege decisions | Denied protected operation, role/permission grant or revocation, privileged-action denial |
| `SENSITIVE_READ` | Reads of especially restricted data | Viewing CPF, viewing pickup address, approved bulk sensitive-data view or export |
| `BOOKING_MUTATION` | Changes to booking lifecycle | Booking cancellation, booking status change, correction of sensitive booking data when later approved |
| `CONFIGURATION_MUTATION` | Changes with operational or financial effect | Package price change, package activation/duration change, operating-calendar/closure change |
| `SECURITY_FAILURE` | Security-relevant failures or rejected operations | Invalid audit envelope, suspicious token/access attempt, failed security control, persistence failure affecting a protected operation |
| `AUDIT_ACCESS` | Access or security events concerning the audit trail itself | Audit-record view, broad audit search, approved audit export, audit-reader permission change, integrity/tamper alert |

## Minimum event contract

The contract is additive and versioned. Consumers must not depend on storage ordering, internal persistence identifiers, transport, or undocumented metadata.

| Field | Requirement |
|---|---|
| `eventId` | Stable unique audit-event identifier generated by the audit boundary or another approved authoritative boundary; never a customer, booking, session, or token identifier. It is for accountability only and must not grant authorization by possession or be usable as a public access credential. |
| `schemaVersion` | Version of the event contract. Future additions must preserve compatibility and must not repurpose existing fields. |
| `category` | One of the defined event categories. |
| `action` | Stable, allowlisted action name describing what was attempted or performed, such as `AUTHENTICATION_SUCCEEDED`, `CPF_VIEWED`, `BOOKING_CANCELLED`, `PRICE_CHANGED`, or `CALENDAR_CHANGED`. |
| `outcome` | Stable allowlisted result: `SUCCEEDED`, `DENIED`, `FAILED`, or `DEGRADED_AUDIT`. It must not contain an internal error message. |
| `occurredAt` | Server-authoritative timestamp in an unambiguous UTC representation. The selected implementation must preserve enough precision to order closely related security events. |
| `actor` | Minimized stable actor representation; see below. |
| `target` | Minimized stable resource representation; see below. |
| `correlationId` | Optional stable identifier used only to relate a bounded operation or security incident across approved systems. It must not be a public tracking token, session token, credential, raw request identifier containing PII, or a complete request trace. It is for correlation only and must not grant authorization by possession or be usable as a public access credential. |
| `reasonCode` | Optional allowlisted machine-readable reason for a denial/failure; no free-text customer, credential, or request data. |
| `metadata` | Optional, schema-defined, allowlisted, minimized metadata. It must be empty when no approved field is necessary. |

### Actor representation

- Represent an authenticated staff actor with a stable internal actor identifier and actor type; do not store staff email, phone, name, session token, or credential in the event by default.
- Represent an unauthenticated actor as an allowlisted actor type such as `ANONYMOUS` or `UNKNOWN`; do not turn unauthenticated attempts into a PII collection mechanism.
- A service or future integration actor may use a stable service identifier only after an approved contract extension.
- The relationship between a minimized actor identifier and a real person remains protected in the relevant identity boundary.
- Minimized actor identifiers must not embed PII, credentials, tokens, or authorization capability; they are accountability identifiers only.

### Target/resource representation

- Represent targets with a stable internal resource type and identifier, such as `BOOKING`, `PACKAGE`, `OPERATING_CALENDAR`, `ROLE_ASSIGNMENT`, or `ADMIN_ACCOUNT`.
- Do not use CPF, address, licence plate, phone, email, public tracking token, or human-readable customer data as target identifiers.
- For a sensitive read, record the sensitive-data class accessed (for example `CPF` or `PICKUP_ADDRESS`) and a minimized resource reference, not the viewed value.
- Minimized target identifiers must not embed PII, credentials, tokens, or authorization capability; they are accountability identifiers only.

## Prohibited fields and PII minimization

Audit records must never contain:

- Raw CPF, full pickup address, phone, email, licence plate, customer name, or unnecessary PII.
- Public tracking tokens, session tokens, passwords, credentials, authorization headers, cookies, secrets, or payment data.
- Complete request bodies, response bodies, database records, object snapshots, stack traces, SQL/NoSQL queries, or free-form diagnostic payloads.
- Raw error messages when they can expose internal details, user input, credentials, tokens, or PII.

The audit boundary must use strict event schemas and allowlisted metadata. It must record that a sensitive resource was accessed or changed without serializing its content.

## Tamper resistance and record integrity

- Audit records are append-only from the perspective of all ordinary administrative users and normal application workflows.
- Corrections, if ever required, must be represented by a new linked event; historic records must not be rewritten or deleted through ordinary administration.
- The later architecture must provide integrity protections that make unauthorized alteration, deletion, reordering, or insertion detectable and restrict write capability to the audit boundary.
- The later architecture must define access separation, integrity verification, alerting/operational response for suspected tampering, and protection of backup copies without selecting a vendor or storage technology here.
- Administrative read permissions for audit records must be narrower than ordinary booking-management permissions and must not enable record mutation.

## Required event coverage

### Authentication and authorization

- Authentication success and failure.
- Security-relevant account/session events when later defined, including invalidation, recovery, or anomaly handling.
- Protected-operation denial and failed authorization decision when security-relevant.
- Privilege/role grant, revocation, or other permission change, including actor, target, action, outcome, and correlation where appropriate.

### Sensitive administrative reads

- Viewing CPF.
- Viewing pickup address.
- Future bulk sensitive-data views, exports, or print actions if approved.

The event records the data class and minimized target reference, never the value viewed.

### Sensitive mutations

- Booking cancellation.
- Booking status changes.
- Package price changes.
- Package activation or duration changes when later implemented.
- Operating-calendar, holiday, closure, or availability changes.
- Privilege changes.

Each mutation event must identify the action and target by minimized stable identifier. It must not serialize prior or resulting complete records; any later need to distinguish an approved bounded change must use explicitly allowlisted, non-PII change descriptors.

### Audit-of-audit access and integrity

- Viewing an audit record.
- Broad audit searches.
- Audit exports, if ever approved.
- Changes to audit-reader permissions.
- Integrity/tamper alerts and their handling outcome.

Audit-of-audit events must use minimized actor/target/action/outcome information and must never recursively serialize an audit payload, search result, export contents, or event metadata from the accessed record.

## Retention, deletion, and backups

- Minimized audit records are retained for 24 months. This is an approved product/security retention period, not a claimed universal statutory LGPD period.
- Retention must account for the audit purpose, privacy minimization, backup lifecycle, access restriction, and any separately verified legal or business requirement.
- Audit records must retain only the minimum identifiers and metadata needed for accountability; privacy deletion must not turn audit storage into a duplicate PII archive.
- Where an approved deletion/anonymization policy affects a referenced resource, audit records should preserve accountability through minimized references and must not add raw PII to compensate.
- Audit backups follow the approved backup-deletion semantics: active systems process deletion/anonymization according to policy; immutable backup archives may retain historic copies only within a finite documented lifecycle; expired backups are securely removed; and previously processed deletions/anonymizations are reapplied before an older restored system returns to normal operation.
- Any Brazilian legal requirements affecting audit retention, privacy, deletion, access, or backup handling are open questions requiring later `source-driven-development` verification using current official Brazilian sources.

## Observability separation

- Normal logs, metrics, traces, monitoring, and alerts may report audit-pipeline health using sanitized operational information, but must not copy audit payloads or prohibited fields into observability systems.
- An audit persistence failure may be observable through a non-PII health signal and correlation identifier, not through the original sensitive event payload.
- Audit records are not automatically exported to analytics, debugging tools, support tools, or third-party monitoring systems.

## Performance and availability boundaries

- The minimal envelope is intentionally bounded and must not serialize full objects or variable-size request/response payloads.
- Audit work must not create an unbounded latency, storage, or retry path for ordinary operations.
- Degraded-audit behavior must be explicit, observable, and limited to the risk classes below; it must not silently discard required events.
- Storage technology, queueing, buffering, retries, ordering guarantees, and durability mechanics are deferred architecture decisions.

## Durable audit consistency invariant

For an operation classified as requiring durable audit confirmation, the eventual architecture must guarantee that the sensitive domain effect and its required audit event cannot silently diverge.

- The operation must not be reported as successfully completed unless the required audit event has durable acceptance.
- An audit event must not report `SUCCEEDED` for a domain effect that did not successfully occur.
- Crashes, timeouts, or uncertain outcomes between domain mutation and audit persistence must have a defined recoverable consistency path before implementation.
- For sensitive reads, including CPF or pickup-address views, durable audit acceptance must occur before the sensitive value is released to the caller.
- The eventual architecture must explicitly solve this consistency boundary before implementation. This specification does not choose a transaction, queue, database, vendor, or other mechanism.

## Retry, replay, idempotency, and ordering invariants

- The eventual implementation must prevent retries from creating contradictory audit outcomes.
- Audit retry behavior must not cause duplicated business effects.
- The audit boundary must detect or safely tolerate duplicate audit submissions.
- Durable-confirmation operations require explicitly defined idempotency and replay behavior before implementation.
- A global total ordering of all audit events is not required by this specification. The eventual architecture must instead preserve enough trustworthy temporal and causal information to reconstruct relevant security sequences for the same operation, actor, or resource.
- The concrete identifier, ordering, replay, and idempotency mechanisms remain deferred.

## Failure behavior and risk classification

The system must not choose fail-open or fail-closed globally. When audit persistence is unavailable, the operation is classified as follows.

| Risk class | Operations | Required behavior when durable audit persistence is unavailable |
|---|---|---|
| May proceed with degraded auditing | Authentication failures that are already denied; non-sensitive administrative reads; low-risk denied requests that do not reveal PII or change state | The underlying denial/read may proceed. Emit a sanitized `DEGRADED_AUDIT` health/event signal through an approved mechanism when possible; do not silently claim that durable auditing succeeded. |
| Requires durable audit confirmation | Privilege/role changes; CPF views; pickup-address views; booking cancellation; booking status changes; package price changes; operating-calendar, holiday, closure, or availability changes | Do not complete the sensitive action unless the architecture can confirm durable audit acceptance for the corresponding event. Return a sanitized, retry-safe failure/deferred result without exposing audit internals. |
| Requires later architecture approval | Authentication success/session issuance or revocation; account recovery; bulk sensitive-data views/exports; security-configuration changes; any new high-impact action not listed above | Do not infer a default. The relevant future module specification and architecture review must decide the failure semantics after evaluating security, availability, abuse, and operational-recovery tradeoffs. |

For all classes, failures must be visible to authorized operations personnel through sanitized health monitoring, and any retry/recovery mechanism must avoid duplicate or contradictory audit records. Detailed durability, ordering, and idempotency mechanics are deferred.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. No framework, database, storage technology, logging vendor, observability vendor, cloud provider, or audit implementation is selected.
- **Commands:** Not applicable. This is a policy/contract specification and creates no executable artifact.
- **Project structure:** Deferred. The specification establishes a module boundary, not an implementation layout.
- **Code style:** Not applicable. No application code or interface language binding is selected.
- **Testing and verification expectations:** Deferred to implementation-capable specifications, but implementation must verify schema rejection of prohibited/unrecognized fields; required-event production; authorization of audit reads; ordinary-admin inability to alter records; tamper-detection behavior; retention/deletion/restore behavior; and each defined audit-persistence failure class. Tests must use synthetic data and must not use production PII by default.

## Acceptance criteria

- [ ] A minimal, versioned, additive event contract exists with category, action, outcome, timestamp, minimized actor, minimized target, and bounded optional correlation/reason/metadata fields.
- [ ] Authentication, authorization, privilege changes, CPF/pickup-address views, booking cancellation/status changes, price changes, and operating-calendar changes have defined audit coverage.
- [ ] Audit events never contain raw CPF, full pickup address, public tracking tokens, session tokens, passwords, authorization headers, credentials, complete request/response bodies, database records, or unnecessary PII.
- [ ] Actor and target references use minimized stable identifiers; sensitive-read events record data class, never the viewed value.
- [ ] Normal application logs and audit records remain separate, including observability exports.
- [ ] Ordinary administrative users cannot edit, delete, rewrite, or directly manage audit records.
- [ ] The architecture supplies append-only and tamper-detection/integrity protections without making a technology choice in this specification.
- [ ] Audit-read access is explicitly authorized and more restricted than ordinary booking management.
- [ ] Audit-record views, broad searches, approved exports, audit-reader permission changes, and integrity/tamper alerts have minimized audit coverage without recursively serializing audit payloads.
- [ ] Minimized audit records are retained for 24 months as an approved product/security policy, without claiming it is a universal legal period; separately applicable official legal requirements remain subject to verification.
- [ ] Audit persistence unavailability follows the risk classification and does not silently default to fail-open or fail-closed.
- [ ] Security-relevant fields are authoritative server-side values: actor identity is derived or verified from trusted context; action/category are allowlisted; outcome and timestamp are server-authoritative; client input cannot claim identity, privilege, success, or a security event.
- [ ] Durable-confirmation operations cannot be reported successful without durable audit acceptance; `SUCCEEDED` cannot falsely represent an unapplied effect; uncertain crash/timeout paths have defined recovery; CPF/pickup-address values are not released before durable audit acceptance.
- [ ] Retry/replay behavior prevents contradictory outcomes and duplicated business effects, detects or safely tolerates duplicate submissions, and defines idempotency for durable-confirmation operations.
- [ ] Event, correlation, actor, and target identifiers do not embed PII, credentials, or tokens and cannot be used as authorization or public-access credentials; relevant causal sequences can be reconstructed without requiring a global total order.
- [ ] Implementation verification uses synthetic data and covers prohibited fields, integrity, access controls, backup restoration, and failure behavior.

## Boundaries

### Always

- Emit only validated, allowlisted, minimized audit events.
- Keep audit records separate from normal logs, telemetry, analytics, and support data.
- Use stable minimized actor and target identifiers; record sensitive-data classes rather than sensitive values.
- Protect audit records as append-only and restrict reads and writes by least privilege.
- Apply the defined risk classification when audit persistence is unavailable and surface failures through sanitized health signals.
- Derive security-relevant event fields from authoritative server-side context and validate all envelopes at the audit boundary.
- Enforce the durable audit consistency invariant and retry/replay/idempotency invariants for operations that require durable audit confirmation.
- Audit access to the audit trail itself without recursively recording audit payloads.

### Ask First

- Adding an event category, action, metadata field, correlation scheme, PII field, external audit/observability integration, or audit-data export.
- Changing the approved 24-month audit retention, backup, access, integrity, or failure-mode rules.
- Allowing an operation that requires durable audit confirmation to proceed while auditing is degraded.
- Changing the durable audit consistency, retry/replay/idempotency, causal-ordering, or audit-of-audit access rules.
- Selecting storage, transport, queueing, monitoring, logging, cloud, or backup technology.
- Defining any legal or regulatory retention/compliance conclusion.

### Never

- Store raw CPF, full pickup address, public tracking tokens, session tokens, passwords, credentials, authorization headers, payment data, complete request/response bodies, database records, or unnecessary PII in audit events.
- Serialize arbitrary metadata, full object snapshots, or unbounded diagnostic payloads into audit records.
- Treat normal application logs as the audit trail or automatically mirror audit records into observability/analytics systems.
- Permit ordinary administrative users to edit, delete, rewrite, or directly manage audit records.
- Silently apply global fail-open or fail-closed behavior when audit persistence fails.
- Trust client-controlled input to claim actor identity, privilege, action/category, success outcome, timestamp, or security event.
- Report a durable-confirmation operation as successful without durable audit acceptance, release CPF/pickup-address values before that acceptance, or emit `SUCCEEDED` for an unapplied domain effect.
- Use event, correlation, actor, or target identifiers as authorization or public-access credentials, or embed PII, credentials, or tokens in them.
- Recursively serialize audit records or payloads when auditing access to the audit trail.
- Invent legal retention periods or Brazilian legal/compliance requirements.

## Open questions requiring human approval or later source-driven verification

1. Which roles may read audit records, and what additional restriction or review applies to sensitive-read audit events?
2. Are successful authentication/session issuance, account recovery, bulk sensitive-data export, and security-configuration changes appropriately classified as requiring later architecture approval, or should any be moved to durable audit confirmation?
3. Which bounded, non-PII change descriptors—if any—are needed to make price, calendar, or status events operationally useful without storing record snapshots?
4. What exact backup retention period and deletion/anonymization treatment apply to audit backups, consistent with the approved finite-backup-lifecycle rule?
5. Which Brazilian legal requirements affect audit retention, privacy, access, deletion, backup restoration, or evidence integrity beyond the approved 24-month product/security period? This requires later `source-driven-development` verification using current official Brazilian sources.
6. What integrity, recovery, ordering, idempotency, and replay guarantees are needed for the eventual audit architecture, especially during degraded persistence, uncertain outcomes, and restoration?
