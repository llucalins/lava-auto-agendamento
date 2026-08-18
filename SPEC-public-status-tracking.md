# Spec: public-status-tracking

## Status

Draft for human review. This is the Phase 1 specification for `public-status-tracking` only. It does not authorize planning, implementation, or work on `admin-operations` or another module.

## Objective

Define a secure, unauthenticated status-minimum capability through which a customer who possesses a separately issued public tracking credential may check the current authoritative status of their own confirmed booking. The capability provides no customer account and must never become a general public booking reader.

## Assumptions

1. The public tracking credential is an opaque, separate capability, not a customer account or a customer identity proof.
2. `booking-lifecycle` remains the only authoritative source for booking status; this module creates no independently mutable public status copy.
3. The approved MVP public projection is exactly the authoritative booking status only; any future public field requires a separately approved specification change.
4. Credential expiry is approved below; administrative replacement assurance, credential transport/session design, and exact cache/header controls remain unresolved.
5. The capability is a single approved module in `CAPABILITY_MAP.md`; no new capability map or implementation plan is created.

## Scope

This specification defines the public tracking credential, narrowly scoped verification and status projection, credential lifecycle, leakage and abuse controls, privacy, audit/security-signal boundaries, relationships with `booking-lifecycle` and `public-booking-flow`, and future verification expectations.

## Non-goals

- Customer account, signup, password, login, profile, customer identity recovery, public lost-credential recovery, or public PII-based authentication.
- Public booking modification, cancellation, rescheduling, payment, package/calendar discovery, administrative access, audit-history access, or general booking lookup.
- A public response containing booking PII, full booking details, internal booking identifiers, package/customer/vehicle data, staff information, capacity data, administrative notes, internal timestamps, or status history.
- Choosing a framework, database, ORM, token library, token encoding/length, hashing/KDF implementation, browser/session mechanism, cache/CDN provider, analytics vendor, cloud provider, or HTTP mapping.

## Internal booking identity and external tracking credential

- `bookingId` is a stable internal identifier. It is not secret, never grants public access by possession, and must not be used as the public tracking identifier.
- A public tracking credential is separate from, independent of, and non-derivable from `bookingId`, customer data, booking data, timestamps, or any predictable input.
- The credential is not a customer identity proof and valid possession/proof grants only the status-minimum projection for its associated booking.
- It grants no authority to modify, cancel, or reschedule a booking; read booking PII; read another booking; access administration; or access audit history.
- CPF, phone, email, licence plate, customer name, `bookingId`, or combinations of predictable personal data must never be used as the sole tracking credential. Possession of PII is not authorization to read booking status.

## Tracking credential model and issuance

- The server/security boundary is authoritative for credential creation, association, lifecycle state, verification, replacement, and revocation. The credential must never be generated from client-controlled values.
- A credential may be issued only after an authoritative booking confirmation has succeeded. A failed, rejected, incomplete, or nonexistent booking confirmation must never yield a usable credential.
- The credential must be cryptographically random, high entropy, non-enumerable, unsuitable for sequential guessing, and unpredictable to an attacker without access to the authoritative generation boundary.
- The exact token encoding and length remain deferred. The later design must justify that its entropy/unpredictability properties resist practical online guessing for the credential's accepted lifetime and the approved abuse controls.
- MVP permits at most one active public tracking credential per booking. Initial issuance establishes that credential; ordinary MVP behavior never leaves multiple credentials valid simultaneously for one booking.
- Replacement creates a new independent credential and invalidates the previously active credential. Concurrent issuance/replacement attempts must not produce multiple active credentials. `bookingId` remains unchanged.
- `public-booking-flow` may deliver or link the capability only after confirmed booking success. Credential semantics, storage, verification, and lifecycle remain owned by this module.

## Confirmation, issuance, and delivery consistency

- Authoritative booking confirmation and tracking-credential issuance/delivery are separate effects. Tracking delivery failure must never roll back, delete, duplicate, or silently alter an already authoritatively confirmed booking.
- A failed booking confirmation must never produce a valid credential. Conversely, a status page must never imply that the booking itself failed merely because credential issuance or delivery failed.
- Browser refreshes, retries, network timeouts, and ambiguous delivery outcomes must not create uncontrolled multiple active credentials.
- The eventual architecture must explicitly handle a credential that was generated and activated but whose raw value was not successfully delivered to the customer. Because digest/verifier-only storage can make the raw value unrecoverable after issuance, the later design must define a safe retry, replacement, or recovery path.
- The architecture must maintain coherent issuance/delivery behavior without choosing transaction, locking, storage, or coordination mechanisms in this specification.

## Credential storage and verification

- The future architecture must evaluate storing only a one-way verifier/digest of the raw tracking credential so raw credentials need not be stored at rest. The preferred direction is digest/verifier-only storage where practical.
- Raw tracking credentials must never appear in edge/CDN, reverse-proxy, load-balancer, WAF/security, or application access logs; audit records; analytics; telemetry; monitoring/APM; error reporting; support tooling; or backups merely for lookup convenience. Application-log redaction alone is insufficient if infrastructure before the application boundary captures the value.
- Any later proposal to store a raw credential requires explicit security justification and human approval. Hashing/KDF, persistence, and comparison mechanisms remain deferred.
- Credential verification occurs only at a trusted server-side boundary using the current authoritative credential lifecycle state. Client-side checks, `bookingId`, cached status, or PII must not substitute for verification.
- Credential validation inputs are untrusted and must be bounded/validated before use. Verification failures must use generic non-enumerating outward behavior.

## Credential lifecycle: expiration, revocation, replacement, and loss

- Every credential has an explicit lifecycle, including expiration. While status is `SCHEDULED` or `IN_PROGRESS`, the active credential remains operational unless revoked, replaced, or otherwise invalidated under this lifecycle.
- On authoritative server-side terminal transition, a credential for `COMPLETED` expires 7 days after that transition and a credential for `CANCELLED` expires 7 days after that transition. Expiry is separate from booking deletion and PII retention; an expired credential no longer authorizes public tracking. Indefinite reusable terminal-state access is prohibited.
- `COMPLETED` and `CANCELLED` remain terminal booking states under `booking-lifecycle`; reaching a terminal state does not itself expose additional information or historic PII. Revocation/replacement may terminate access earlier, and MVP still permits at most one active credential per booking.
- The system must support revoking a credential without deleting, mutating, or changing the booking or its `bookingId`.
- Replacement creates a new independent credential and invalidates the old credential. It must not rewrite booking history or change `bookingId`.
- Issuance, replacement, and revocation require coherent authoritative lifecycle state. The eventual architecture must prevent two unintentionally active credentials, replacement reported successful while the old credential remains usable, a new credential returned without authoritative activation, or revocation reported successful while the credential remains valid.
- MVP provides no public self-service lost-credential recovery. A lost credential cannot be recovered, looked up, or replaced through public use of CPF, phone, email, licence plate, `bookingId`, customer name, or predictable combinations. Any future administrative recovery/replacement workflow belongs to `admin-operations`/`admin-access` and must define sufficient assurance without turning PII into authentication.
- Copied/shared credentials are bearer-capability risks. The lifecycle and transport design must support revocation/replacement without presuming the system can distinguish the intended customer from another possessor.

## URL, transport, browser, and leakage threat model

The raw credential is a sensitive bearer capability. The eventual architecture must threat-model and mitigate leakage through browser history; URLs; query strings; `Referer`/referrer headers; copied/shared URLs; browser sync/history; screenshots; reverse proxies; CDN/access logs; application logs; caches; analytics; monitoring/APM; error reporting; third-party scripts/resources; and support tooling.

- A reusable/long-lived raw bearer credential must not remain in the normal steady-state browser URL after credential proof is established. History-visible URLs must not contain booking PII, internal identifiers, or secrets beyond what an approved credential-transport design explicitly justifies.
- A later architecture must compare, before selection, at least these approaches: direct raw credential in a path/query URL; a one-time or limited bootstrap credential exchanged for a short-lived tracking session; and another security-preserving approach. The comparison must address history, referrer, proxy/CDN and support/monitoring logging, copying, cache, post-verification URL removal, revocation, and usability consequences. A bootstrap/exchange design is a candidate, not a mandated implementation.
- If any raw credential is carried in a bootstrap URL, its exposure, lifetime, reuse properties, logging behavior, referrer behavior, and post-verification removal must be explicitly justified.
- Possible controls requiring later design include restrictive `Referrer-Policy`, appropriate cache controls, redaction/allowlisted logs, safe credential transport, minimal/controlled third-party resources, credential-to-short-lived-session exchange where appropriate, expiration, rotation, and revocation. Exact mechanisms and header syntax are deferred.
- Pages handling credential proof or displaying a status response must minimize unnecessary third-party resources. No analytics, support widget, advertising script, telemetry integration, or third-party resource may receive a raw credential or booking PII unless separately approved under `privacy-governance` with an explicit minimum-data contract.
- Support, monitoring, and error-reporting workflows must use minimized/sanitized data and must not capture raw credential values, full URLs containing credentials, or status-response payloads by default.

## Caching and browser-data boundaries

- Public status responses and credential-handling pages must not be stored in shared/intermediary caches in a way that can expose one customer's status to another. The eventual architecture must also evaluate private browser caching based on bearer-credential and shared-device risks; exact browser/cache controls and HTTP header syntax are deferred.
- The capability must not place raw tracking credentials in application-controlled durable browser storage, such as `localStorage`, `sessionStorage`, IndexedDB, URLs, or similar storage, by default.
- If a temporary browser/session state is later needed, its lifetime and exposure must be minimized and justified against shared-device, browser-sync/history, cache, and copied-link risks. No session mechanism is selected here.
- Browser autofill is separate from application-managed persistence and must not be confused with safe credential storage.

## Status-minimum public projection

The approved MVP public projection is exactly one authoritative field:

| Field | Proposed public meaning |
|---|---|
| `status` | One of `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`, projected from authoritative `booking-lifecycle` state. |

- This projection is intentionally minimum-only. It does not disclose `bookingId`, CPF, pickup address, phone, email, licence plate, full vehicle details, package/customer data, administrative notes, audit information, staff information, capacity information, internal timestamps, or booking history.
- The public response must use explicit field allowlists and must not serialize a booking aggregate or generic record projection.
- No additional booking, customer, package, vehicle, time, or other public field is exposed in MVP. Any future public field requires a separately approved specification change.
- The response represents current authoritative status only; it must not become a mutable cache or independently managed public status record that can diverge from `booking-lifecycle`.

## Authorization, error behavior, and enumeration resistance

- Valid proof of the current approved credential authorizes only the status-minimum projection for the associated booking.
- Invalid, malformed, nonexistent, expired, revoked, replaced, or otherwise unusable credentials must receive generic outward failure behavior that does not reveal whether a booking or credential exists, whether a booking was confirmed, revocation/replacement reason, credential verifier/digest information, internal booking IDs, database details, stack traces, or security configuration.
- Error behavior must not form a useful booking-existence or credential-lifecycle oracle through response-body semantics, redirects, status wording, materially useful timing differences where reasonably avoidable, or recovery options shown only for real bookings. Internal diagnostics may distinguish causes only in sanitized non-public channels. Transport/HTTP mappings and exact customer-facing wording are deferred.
- The public surface must not accept a `bookingId` plus another predictable value as an alternate path to status access.

## Abuse controls and rate limiting

- The unauthenticated tracking surface requires controls against high-rate credential guessing, distributed probing, existence enumeration, malformed-credential floods, replay/resource exhaustion, and automated abuse.
- Rate limits and abuse signals must combine appropriate signals where available and must not rely only on source IP. Controls must be calibrated so valid normal customer status checks remain usable.
- Verification work and response behavior must be bounded so malformed or repeated invalid inputs do not create disproportionate resource consumption.
- Abuse controls must not disclose booking existence, credential lifecycle state, internal capacity, customer data, or internal security thresholds. CAPTCHA/challenge/provider technology is not selected here.

## Audit and security-signal boundaries

- Normal successful status checks do not automatically require durable audit confirmation and must not become unavailable merely because audit persistence is degraded.
- Suspicious guessing, repeated invalid credential use, and abuse-control activation may emit minimized `SECURITY_FAILURE` or other approved security signals under `SPEC-audit-trail.md`. They must contain no raw credential, full URL, PII, status payload, or arbitrary request data.
- Credential revocation is a risk-reducing security action. When durable audit persistence is unavailable, revocation may proceed with degraded auditing when necessary to terminate suspected compromised access; it must emit sanitized operational/security signaling where possible and must not leave the credential valid merely to preserve audit availability.
- Replacement or administrative new-credential issuance grants new bearer authority. When performed through a future authorized administrative recovery workflow, it requires durable audit confirmation before the new credential is reported successfully issued. Audit records use minimized identifiers and never include the raw credential.
- Initial automatic credential issuance immediately after normal public booking confirmation is not a durable-audit dependency merely because the credential is created; this preserves the approved public-booking-flow availability boundary.
- Audit and normal application logs remain separate. `eventId`, correlation identifiers, internal references, and audit records are never public credentials or public response fields.

## Relationships with approved modules

### `booking-lifecycle`

- Owns authoritative booking identity, confirmation, and current status state.
- Supplies the current status through a minimized internal projection. `public-status-tracking` cannot mutate, independently store, or override booking status.
- A tracking credential is issued only after authoritative confirmed-booking success; it must never make an unconfirmed booking publicly readable.

### `public-booking-flow`

- May deliver or link the tracking capability after successful authoritative confirmation, subject to this module's credential semantics and privacy boundaries.
- Does not create a credential after failed confirmation and does not define credential lifecycle, verification, URL, storage, tracking authorization, or public response semantics.
- This specification does not modify the approved public booking flow.

### `privacy-governance`

- Applies its data-minimization, no-PII-public-response, no-unapproved-external-sharing, sanitized-log/telemetry, retention/deletion, and synthetic-non-production-data rules.
- The tracking module uses minimized internal references and must not duplicate booking PII into a tracking store, response, audit event, cache, analytics system, or support tool by default.

### `audit-trail`

- Supplies the approved minimized event contract and durable-audit failure classification. This module does not make normal tracking reads an audit availability dependency.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. No framework, database, ORM, token library, token encoding/length, hashing/KDF implementation, browser/session mechanism, cache/CDN provider, analytics vendor, cloud provider, or HTTP framework is selected.
- **Commands:** Not applicable. This specification defines a public capability contract and creates no executable artifact.
- **Project structure:** Deferred. No implementation layout is selected.
- **Code style:** Not applicable. No application code or interface binding is selected.
- **Testing and verification expectations:** Future implementation must verify cryptographically strong unpredictable credential generation; `bookingId`/credential separation and non-enumerability; one-active-credential enforcement under concurrent issuance/replacement; rejection of PII-based access; server-side credential verification; generic invalid/malformed/nonexistent/expired/revoked/replaced behavior without response/redirect/timing/recovery oracles; operational access during `SCHEDULED`/`IN_PROGRESS`, authoritative 7-day expiry after `COMPLETED`/`CANCELLED`, and earlier revocation/replacement; status-only field allowlist with no PII/internal identifiers; confirmation/issuance/delivery failure and ambiguous-outcome consistency; no raw credential in edge/CDN, proxy, load-balancer, WAF, application, audit, analytics, telemetry, monitoring, error, support, or backup capture; brute-force, rate-limit, and distributed-abuse considerations; shared/intermediary and private-browser cache evaluation; referrer/history/URL/proxy/CDN/log/screenshot/browser-sync leakage controls and post-verification URL removal; third-party-resource restrictions; confirmed-booking issuance only; no valid credential after failed booking confirmation; current authoritative status projection; revocation/replacement audit classification; and synthetic data only.

## Acceptance criteria

- [ ] A tracking credential is distinct from internal `bookingId`, high-entropy, cryptographically random, non-enumerable, independent of predictable customer/booking data, and issued only by a server/security boundary after authoritative confirmation.
- [ ] `bookingId`, CPF, phone, email, licence plate, customer name, and predictable combinations never act as public tracking credentials or alternate public authorization.
- [ ] Credential verification is server-side and uses current credential lifecycle state; raw credential storage is evaluated against a digest/verifier-only preference, while raw at-rest storage requires explicit security justification and human approval.
- [ ] MVP maintains at most one active credential per booking: concurrent issuance/replacement cannot create more; replacement invalidates the prior active credential; and `bookingId` and booking history remain unchanged.
- [ ] A credential remains operational during `SCHEDULED`/`IN_PROGRESS` unless invalidated, expires exactly 7 days after authoritative `COMPLETED` or `CANCELLED` transition, supports earlier revocation/replacement, and public lost-credential recovery or lookup never uses PII as proof.
- [ ] Credential issuance/delivery cannot alter an already-confirmed booking; failed confirmation creates no credential; ambiguous issuance/delivery outcomes cannot create uncontrolled credentials; and unrecoverable raw-value delivery failure has a safe retry/replacement/recovery path.
- [ ] The approved public response is an explicit status-only projection from current authoritative `booking-lifecycle` state and exposes exactly `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`.
- [ ] Public status access cannot modify or cancel a booking, read booking PII, read another booking, access administration, or access audit history.
- [ ] Raw credentials and status PII are excluded from edge/CDN, proxy, load-balancer, WAF, application, audit, analytics, telemetry, monitoring, error, support, and backup capture; public responses contain no PII, internal identifiers, audit, staff, capacity, history, or unrelated booking details.
- [ ] A reusable/long-lived raw credential is absent from the steady-state browser URL after proof. The eventual design evaluates bootstrap exposure, history, referrers, copied/shared links, browser sync, screenshots, proxies/CDNs/access logs, caches, third parties, monitoring, and support tooling before selecting transport/session behavior.
- [ ] Tracking responses cannot be exposed through shared/intermediary caches; private-browser caching and temporary browser/session state are evaluated for bearer-credential and shared-device risk without selecting mechanisms.
- [ ] Generic errors and differentiated, non-IP-only abuse controls resist guessing, enumeration, malformed-input floods, distributed probing, and resource exhaustion without exposing credential/booking existence.
- [ ] Normal successful reads and initial automatic post-confirmation issuance do not require durable audit confirmation; compromised-credential revocation may proceed with degraded auditing and sanitized signaling; administrative replacement/new issuance requires durable audit confirmation before success is reported.
- [ ] Future tests cover the stated security, lifecycle, privacy, leak, cache, abuse, authoritative-status, issuance-boundary, and synthetic-data expectations without technology choices.

## Boundaries

### Always

- Keep the capability unauthenticated, status-minimum-only, and separate from customer accounts and internal booking identity.
- Treat `booking-lifecycle` as authoritative for current status and the server/security boundary as authoritative for credential lifecycle and verification.
- Use explicit response-field allowlists; minimize internal references; keep PII, internal IDs, raw credentials, and security internals out of public responses, logs, audit, telemetry, analytics, and errors.
- Maintain at most one active credential per booking and preserve coherent issuance, replacement, revocation, and delivery outcomes without altering a confirmed booking for tracking failure.
- Preserve the approved terminal-expiry policy; require lost-credential administrative recovery assurance and leakage/caching analysis before implementation.
- Apply generic non-enumerating errors, bounded validation, and differentiated abuse controls without relying only on source IP.
- Issue credentials only after authoritative confirmation and use synthetic data outside production.

### Ask First

- Adding any public projection field beyond status, defining exact status wording, or changing terminal-state visibility.
- Changing the approved credential expiry policy; choosing administrative replacement authority and recovery assurance or lost-credential workflow.
- Selecting URL/transport/session/cache/referrer/log-redaction/third-party-resource mechanisms, token representation, entropy parameters, verifier/digest technique, storage, framework, database, ORM, CDN, analytics, cloud, or HTTP technology.
- Allowing raw credential storage, PII sharing, a new tracking consumer, a tracking data copy, or a change to the approved audit failure classification.

### Never

- Treat `bookingId`, CPF, contact data, licence plate, name, or predictable customer/booking information as a public credential or authorization substitute.
- Make tracking a general booking reader or allow it to mutate bookings, disclose PII/internal identifiers/audit/staff/capacity/history, or access administration.
- Generate credentials from client-controlled values or issue them for failed/unconfirmed bookings.
- Store or emit raw credentials for lookup convenience in logs, audit records, analytics, telemetry, monitoring, errors, support tools, or backups.
- Allow public self-service credential lookup/recovery using PII or predictable booking data; leave multiple credentials simultaneously active for one booking; or report issuance, replacement, or revocation success without coherent authoritative lifecycle state.
- Assume a long-lived raw credential in a reusable URL is safe, retain one in the steady-state browser URL after proof, expose status in shared/intermediary caches, or choose implementation technology in this specification.

## Open questions requiring human approval

1. What exact administrative assurance and authority are required for credential replacement after a lost credential, without using PII as public proof?
2. Which final transport/bootstrap/session design best minimizes history, referrer, proxy/CDN/logging, copying, cache, and shared-device risks?
3. What exact customer-facing wording and recovery behavior apply to invalid, expired, revoked, replaced, unavailable, and abuse-limited requests while preserving non-enumeration?
4. What retention/deletion lifecycle applies to credential verifiers/digests and related minimized security signals, subject to `privacy-governance` and later official-source verification where appropriate?
