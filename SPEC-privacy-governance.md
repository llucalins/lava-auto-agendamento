# Spec: privacy-governance

## Status

Draft for human review. This is the Phase 1 specification for the `privacy-governance` module only. It does not authorize planning, implementation, or work on another module.

## Objective

Define the cross-cutting privacy and data-handling policy for the car-wash scheduling system so personal information is collected only when operationally necessary, exposed only to authorized parties for a defined purpose, and not duplicated or leaked through public views, logs, analytics, backups, or future integrations.

`privacy-governance` supplies policy constraints to other modules. It must not become a runtime/software dependency or a shared service required for ordinary domain operations.

## Assumptions

1. This specification defines product and engineering policy, not legal advice or a determination of regulatory compliance.
2. CPF, address, phone, email, licence plate, customer name, and vehicle details are treated as PII for the product's protection and minimization rules.
3. No retention period, legal basis, consent requirement, or statutory compliance obligation is assumed here.
4. The system does not process or store payment credentials, banking credentials, PIX credentials, or payment secrets.
5. Framework, database, hosting, authentication mechanism, backup technology, analytics provider, notification provider, and encryption implementation remain undecided.

## Scope

This specification covers:

- Classification, purpose, collection, minimization, access, exposure, retention, deletion, and duplication rules for PII.
- Privacy requirements for public booking, public status tracking, administration, logs, analytics, telemetry, audit records, backups, and future notification providers.
- Privacy acceptance criteria and cross-cutting boundaries that future module specifications must satisfy.

This specification does not cover:

- Runtime implementation, schema, APIs, framework, database, or infrastructure selection.
- Authentication/authorization implementation details, audit event contract design, booking implementation, or notification-provider integration.
- Legal retention schedules, legal bases, consent wording, or statutory compliance conclusions.

## Data classification and purpose

Labels such as **High-risk PII** in this document are internal engineering risk classifications used to apply stricter controls. They are not claims about statutory classifications under Brazilian law. Legal classification remains subject to later `source-driven-development` verification using current official Brazilian sources.

| Data category | Classification | Operational purpose | Collection rule | Exposure rule |
|---|---|---|---|---|
| Full name | PII | Identify the customer for the booked service and operational communication | Required only when creating a booking | Never public; administrative access only when operationally necessary |
| CPF | High-risk PII | Current confirmed MVP customer data requirement; its business necessity remains an open privacy/legal question | Collect as part of MVP booking customer data; do not reuse for unrelated purposes | Never public; tightly restricted administrative access |
| Phone / WhatsApp | PII | Service-related operational contact and future approved notifications | Collect for the booking contact purpose; do not use for unrelated outreach | Never public; limited operational access |
| Email | PII | Optional service-related contact and future approved notifications | Collect only when supplied by the customer | Never public; limited operational access |
| Pickup address | High-risk PII | Vehicle pickup when the customer selects pickup | Collect only when pickup is selected | Never public; access only to staff who need it to perform pickup operations |
| Vehicle model and colour | PII-linked operational data | Identify the vehicle and perform the service | Collect only for the booking/service | Never public; operational access only |
| Licence plate | High-risk PII-linked operational data | Identify the vehicle for the booking/service | Collect only for the booking/service | Never public; tightly restricted operational access |
| Intended payment method | Operational data | Prepare the handoff/collection process; not a payment instrument | Collect only as an intended method | Never public; operational access only |
| Public tracking token | Secret access credential, not display data | Allow status-minimum tracking without customer login | Generate only for a confirmed booking | Never expose in logs, analytics, audit events, errors, or public response payloads; do not expose internal IDs through it |
| Administrative identity, session, and permissions | Security-sensitive PII/credential data | Authenticate and authorize staff | Collect only as required for administration | Never public; restricted to the relevant security boundary |
| Audit event identifiers | Minimized security data | Accountability for sensitive actions | Store only minimized actor/target identifiers and event metadata | Restricted to authorized review; never include raw high-risk PII or credentials |

## Data minimization and collection rules

- Collect a field only when it has the operational purpose stated in this specification or a later approved specification.
- Do not collect optional data merely because it may be useful later.
- Address is conditional: it is collected only after pickup is selected.
- Email is conditional: it is collected only when provided by the customer.
- CPF is a current confirmed MVP customer-data requirement and must not be silently removed, made optional, or repurposed by this specification.
- Whether CPF collection is necessary for the stated business purpose, which Brazilian privacy/legal requirements apply, and whether a less sensitive identifier could meet the same need are open questions. They must be verified later through `source-driven-development` using current official Brazilian sources before CPF storage implementation is finalized.
- If that verification recommends removing CPF, the confirmed intent and this specification must be updated explicitly and approved by the human before implementation.
- Do not collect payment credentials, banking credentials, PIX credentials, or payment secrets.
- User-facing collection should clearly distinguish required information from optional information and from conditional pickup information.
- Future modules must validate and constrain incoming data at their system boundaries, but this policy does not prescribe a validation library or implementation.

## Access and least-privilege principles

- Access to PII is granted by role, action, resource, field, and operational purpose; authentication alone is insufficient.
- Administrative users receive only the smallest access set needed for their assigned work.
- Pickup address and CPF require explicit, more restricted access because they are higher-risk operational data.
- Public users have no PII-reading capability. Possession of an internal booking ID must never authorize any access.
- Administrative displays and responses must use explicit permitted-field projections rather than whole-record exposure.
- Future role definitions and authorization mechanics belong to `admin-access` and `admin-operations`, but they must comply with these policy rules.

## Public exposure rules

- Public booking pages may collect only the inputs needed for the booking flow and may show only public catalogue, availability, and price information.
- Public status tracking is a status-minimum projection, not a general booking reader.
- Public responses must never include CPF, full address, phone, email, full vehicle details beyond what is demonstrably necessary, administrative notes, credentials, audit data, or internal identifiers.
- Public tracking uses a cryptographically random, high-entropy, non-enumerable token; it must not embed, expose, or derive internal IDs.
- The public tracking token must never appear in logs, analytics, audit events, telemetry, or error responses.
- Expiration, revocation, replacement behavior, and the assessment of one-way token-digest storage are required decisions for the `public-status-tracking` specification.

## Administrative exposure rules

- Administrative views may expose only the fields necessary for the authorized operational action.
- Customer/vehicle details, pickup requirements, package, price, intended payment method, status, and history must not imply universal staff access to all PII.
- CPF and pickup address must be accessible only where operationally necessary and under explicitly authorized permissions.
- Search, lists, exports, printing, and bulk views must not become a means to expose more PII than the relevant operational task requires.
- Configuration data that is not PII (packages, prices, calendar) remains subject to authorization but does not need PII-level display restrictions.

## Logging, analytics, errors, and telemetry

- Logs, analytics, telemetry, traces, and production error reports must not contain raw CPF, full address, phone, email, licence plate, public tracking token, session token, credentials, authorization headers, passwords, or unnecessary PII.
- Instrumentation must use allowlisted fields and sanitized/minimized identifiers where diagnostics require correlation.
- Production errors shown to users must be generic and must not expose PII, tokens, internal identifiers, stack traces, persistence details, or security configuration.
- Error and telemetry design must avoid capturing raw request bodies by default where they can contain PII.
- No analytics or support integration may receive PII unless separately approved with a defined purpose and minimum-field contract.

## Audit and privacy interaction

- `audit-trail` is a separate runtime capability; this policy does not make it a privacy-governance runtime dependency.
- Audit records may contain only the minimum needed for accountability: minimized actor identifier, action, minimized target identifier, result, and timestamp when relevant.
- Audit records must not contain raw CPF, full address, public tracking token, session token, credentials, or unnecessary PII.
- Sensitive administrative access and mutations require auditability, but the event contract and implementation remain the responsibility of `audit-trail`.

## Backup privacy requirements

- Backups containing PII must be restricted to authorized operational access and protected appropriately for their risk.
- PII must be deleted or anonymized from active systems according to the approved deletion policy.
- Privacy deletion does not necessarily require editing individual immutable backup archives. Backups containing deleted PII must instead have a finite, documented retention lifecycle, and expired backups must be securely removed according to that lifecycle.
- If an older backup is restored, previously processed deletions or anonymizations must be reapplied before the restored system returns to normal operation.
- Backup retention and deletion behavior must be defined so that privacy deletion requests and normal retention rules can be reasoned about across primary data, backups, caches, analytics, and future provider copies.
- Backup implementation, encryption mechanism, restore tooling, and retention duration are deferred; they must not be chosen by this policy-only module.
- Restoration procedures must preserve the same privacy restrictions as the primary data path.

## Retention and deletion principles

- Every PII category must have a defined retention purpose and a future-approved retention rule before production use.
- Retain PII no longer than necessary for its approved operational purpose, subject to any later verified legal or business requirement.
- Deletion must address primary records and relevant copies in backups, caches, analytics, logs, and approved third parties according to their documented lifecycle.
- Deletion, anonymization, archival, and exceptions must be specified before implementation; this document does not invent their timing or legal conditions.

## Future notification providers

- No provider is selected by this specification.
- A future notification capability may receive only the minimum data necessary for the specific approved message and delivery channel.
- Provider approval must define purpose, data fields, retention/deletion behavior, access restrictions, error handling, logging restrictions, and the customer-choice/legal questions requiring source-driven verification.
- Notification providers must not receive CPF, pickup address, tracking token, credentials, payment data, or unrelated booking data unless a later human-approved specification establishes an operational need and privacy boundary.
- Delivery failures and provider telemetry must remain sanitized.

## Preventing unnecessary duplication of PII

- Keep authoritative PII in the booking/customer data boundary; do not copy it into catalogue, calendar, public-tracking, audit, analytics, or notification modules by default.
- Cross-module records must use minimized references or approved projections rather than duplicated full PII.
- Caches, exports, support tools, test fixtures, screenshots, and documentation must not become unmanaged duplicate PII stores.
- Any new PII copy, derived dataset, external integration, or operational export requires an explicit purpose, access boundary, lifecycle, and human approval.
- Production PII must not be copied into local development, test, demo, CI, or staging environments by default. Tests and demos must use synthetic data.
- Any exceptional use of production-derived data requires explicit approval, a documented purpose, minimization or anonymization where possible, restricted access, and a deletion lifecycle.

## Public tracking token leakage

- The future `public-status-tracking` specification must explicitly threat-model token leakage through browser history, `Referer` headers, reverse proxies, CDN/access logs, caches, monitoring, third-party resources, and copied URLs.
- That Phase 1 specification must evaluate appropriate controls, without selecting an implementation here: `Referrer-Policy`, cache controls, third-party resource restrictions, safe token transport, short-lived tracking sessions where appropriate, rotation, expiration, and revocation.
- Token leakage considerations must preserve the existing rule that the token is never logged in application logs, analytics, audit events, telemetry, or error responses.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. Choosing a framework, database, package, hosting platform, encryption product, or provider is outside this policy-only module.
- **Commands:** Not applicable. This specification defines policy and creates no executable artifact.
- **Project structure:** Deferred. No application structure is selected; the approved specification file is the sole artifact of this phase.
- **Code style:** Not applicable. No code is specified.
- **Testing strategy:** Deferred to implementation-capable module specifications. Policy acceptance is reviewed through document conformance now; future modules must translate the relevant policy rules into verifiable tests and reviews without selecting a test framework here.

## Security and privacy acceptance criteria

- [ ] The policy remains cross-cutting and creates no runtime/software dependency from domain modules to `privacy-governance`.
- [ ] Every listed PII category has a documented operational purpose, collection condition, and exposure rule.
- [ ] CPF remains a current confirmed MVP customer-data requirement; address is collected only for pickup and email only when supplied.
- [ ] CPF necessity, applicable Brazilian privacy/legal requirements, and a less-sensitive-identifier alternative are marked for later `source-driven-development` verification using current official Brazilian sources before CPF storage implementation is finalized.
- [ ] Public views expose status-minimum or booking-flow-minimum information and never expose internal IDs, CPF, full address, contacts, administrative data, or credentials.
- [ ] The public token is high-entropy, non-enumerable, never logged, and has deferred-but-required expiry, revocation, and digest-storage decisions.
- [ ] Administrative access follows least privilege, with restricted access to CPF and pickup address.
- [ ] Logs, analytics, telemetry, error reporting, and audit records exclude prohibited PII, tokens, credentials, and unnecessary data.
- [ ] Audit records use minimized identifiers and do not duplicate raw high-risk PII.
- [ ] Backups, caches, analytics, and future providers are included in the retention/deletion and duplication boundaries.
- [ ] PII is deleted or anonymized from active systems according to approved policy; immutable backup archives have a finite documented lifecycle, expired backups are securely removed, and deletions/anonymizations are reapplied after an older backup restoration before normal operation resumes.
- [ ] Production PII is not used in local development, test, demo, CI, or staging by default; tests and demos use synthetic data, and exceptions follow the approval, minimization, access, and deletion rules.
- [ ] The future `public-status-tracking` specification threat-models leakage via browser history, `Referer`, proxies, CDN/access logs, caches, monitoring, third parties, and copied URLs, and evaluates the specified control categories.
- [ ] No payment credentials, banking credentials, PIX credentials, or payment secrets are collected or stored.
- [ ] Future module specifications cite and comply with this policy before introducing a new PII category, external sharing, or sensitive-data copy.

## Boundaries

### Always

- Apply data minimization, purpose limitation, least privilege, explicit field exposure, and sanitized error/telemetry rules.
- Treat public tracking tokens, sessions, credentials, CPF, addresses, and unnecessary PII as prohibited from logs and analytics.
- Preserve privacy policy as a cross-cutting constraint rather than a runtime dependency.
- Require a documented purpose and lifecycle for every new PII category or copy.
- When a privacy principle conflicts with a confirmed product requirement, stop and surface the conflict. Do not resolve it implicitly.
- Use synthetic data for tests and demos; do not copy production PII to non-production environments by default.

### Ask First

- Changing the confirmed MVP CPF requirement, or using CPF for a new purpose.
- Adding a new category of PII, external provider, analytics/support integration, export, or PII-bearing cache/replica.
- Defining retention, deletion exceptions, archival, legal basis, consent, or compliance obligations.
- Granting broader access to CPF, address, or bulk customer data.
- Selecting technology that materially changes the privacy or backup boundary.
- Using production-derived data in local development, test, demo, CI, or staging.

### Never

- Collect or store payment credentials, banking credentials, PIX credentials, or payment secrets.
- Expose internal booking IDs as a public access mechanism.
- Put CPF, full address, tracking tokens, session tokens, credentials, authorization headers, passwords, or unnecessary PII in logs, analytics, telemetry, audit events, or public errors.
- Treat customer login, public token possession, or staff authentication alone as authority to access unrelated PII.
- Duplicate PII into another module or external system without an approved purpose, access boundary, and lifecycle.
- Copy production PII into local development, test, demo, CI, or staging by default.
- Make unverified legal or compliance assertions in this specification.

## Open questions requiring human approval or later source-driven verification

1. Is collecting CPF actually necessary for the stated business purpose? What lawful basis or applicable Brazilian privacy requirements apply, and could a less sensitive identifier satisfy the same operational need? This must be verified later through `source-driven-development` using current official Brazilian sources before CPF storage implementation is finalized. If verification recommends removing CPF, the confirmed intent and this specification must be explicitly updated and approved by the human before implementation.
2. What business retention periods are desired for completed/cancelled booking data and for administrative records, independent of legal requirements?
3. Which deletion outcomes are required by the business: deletion, anonymization, archival, or a combination?
4. What staff roles require access to CPF and pickup address, and are there separate staff roles for pickup operations?
5. What public status fields are the minimum useful information for a customer without exposing booking details?
6. What expiration, revocation, and replacement policy should public tracking tokens follow?
7. Should future notifications be opt-in, transactional-only, or subject to another customer-choice model? Any legal/privacy requirement must be verified against current official Brazilian sources before it is adopted.
8. Which analytics, support, hosting, backup, and notification vendors—if any—will be considered? Their data boundaries require separate approval.
9. Which Brazilian legal requirements, including retention, legal basis, consent, data-subject rights, breach handling, and processor obligations, apply to this business? This requires later source-driven verification against current official guidance.
