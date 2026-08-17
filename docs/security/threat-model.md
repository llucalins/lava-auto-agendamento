# Threat Model: Car Wash Scheduling

## Scope and principles

This threat model covers the approved Phase 0 capability map and confirmed product intent. Security and privacy are architectural requirements. No technology, framework, database, or authentication provider is selected here.

The system does not process or store payment credentials, banking credentials, PIX credentials, or payment secrets.

## Trust boundaries

- **Public browser to system:** availability lookup, booking forms, and token-based status tracking are untrusted inputs.
- **Administrative browser to protected area:** identity, session, and authorization must be checked server-side for every operation.
- **Application to storage:** PII, bookings, token digests, sessions, audit events, logs, and backups cross into data stores.
- **Application to future notification providers:** only the minimum required PII may leave the system when a provider is approved.
- **Authorized staff to operational PII:** access must be limited to what is operationally necessary.
- **System to observability, analytics, and support:** telemetry must be sanitized and must not become a secondary PII store.

## Sensitive assets

- Customer identity data: name, CPF, phone/WhatsApp, email, pickup address.
- Vehicle data: model, licence plate, colour.
- Booking details, availability, prices, package durations, operating calendar, and status integrity.
- Public booking tracking tokens and any stored token digest.
- Administrative credentials, sessions, roles, permissions, and recovery mechanisms.
- Audit records, backups, and infrastructure or future-provider secrets.

## STRIDE assessment

| Threat | Primary concern | Required direction |
|---|---|---|
| Spoofing | Impersonating an administrator, session, or trusted future provider | Strong administrator authentication, secure sessions, and verification of trusted integrations before they are added |
| Tampering | Altering bookings, prices, availability, status, or stored records | Server-side authorization, input validation, atomic booking confirmation, parameterized persistence operations, and HTTPS |
| Repudiation | Denial of sensitive administrative action | Early minimal audit contract and security/audit events for access and administrative operations |
| Information disclosure | PII, token, credential, or internal-ID exposure | Field allowlists, status-minimum public responses, least privilege, encryption where justified, and generic production errors |
| Denial of service | Booking spam, brute force, token guessing, or resource exhaustion | Rate limits, request/input size limits, timeouts, and abuse monitoring |
| Elevation of privilege | Employee access beyond assigned operational need | Server-side role and resource authorization on every protected operation |

## Likely abuse cases

| Surface | Abuse case | Security boundary |
|---|---|---|
| Public booking | Automated spam, booking floods, malformed input, or two concurrent confirmations for the same availability | Server-side validation, rate limiting, and atomic availability revalidation at confirmation |
| Booking data | Injection, stored/reflected XSS, or oversharing in responses | Strict boundary validation, parameterized queries, output encoding, and response field allowlists |
| Public tracking | Guessing, leakage, reuse, or enumeration of a tracking token | High-entropy cryptographically random token, digest evaluation in Phase 1, rate limits, expiry/revocation, and minimum-only responses |
| Administrative area | Account compromise, CSRF, session theft, or unauthorized changes | Strong authentication, secure sessions, CSRF protection where applicable, authorization, security headers, and audit events |
| Object identifiers | Replacing an ID in a request to view or alter another record | Resource-level authorization; internal IDs never grant access on their own |
| Catalogue/calendar configuration | Unauthorized changes to prices, packages, hours, or closures | Protected mutations through `admin-operations` plus `admin-access`, with audit events |
| Logs and analytics | Recording PII, credentials, or access tokens | Data minimization, redaction, allowlisted telemetry fields, and secret-safe logging policy |

## Authentication risks

- Brute force, credential stuffing, account enumeration, weak account recovery, session theft, and session fixation are in scope.
- Administrator sessions must use HTTPS-only, `httpOnly`, `Secure`, and appropriate `SameSite` cookie protections; session expiry, rotation, logout revocation, and server-side validation are required directions.
- Login and recovery endpoints require rate limits that consider both source and account identifiers where available; responses must not reveal whether an account exists.
- The authentication mechanism and MFA policy remain Phase 1 architecture decisions. The minimum accepted requirement is strong administrator authentication.

## Authorization and IDOR risks

- Authentication alone is insufficient: every protected action must authorize the actor, action, and target resource server-side.
- Employees must not gain access to bookings, CPF, addresses, or configuration merely by altering internal IDs in URLs or requests.
- The initial authorization direction is least privilege: administrative configuration and staff booking operations must be independently permissioned; CPF and pickup-address access must be explicit and operationally justified.
- Internal booking IDs are not public capabilities and must never be sufficient to read private booking information.

## Public booking token boundary

- The public token must be cryptographically random, high entropy, non-sequential, and non-enumerable.
- It must never expose, embed, or derive an internal booking ID.
- It must never be written to logs, analytics, audit events, error messages, or telemetry.
- The public endpoint may return status-minimum data only; it must not return CPF, address, contacts, full booking details, administrative details, or internal identifiers.
- Phase 1 must evaluate storing only a one-way digest of the public token rather than plaintext.
- Phase 1 must specify an expiration and revocation policy, including the behavior for expired, revoked, or replaced tokens.
- The endpoint requires rate limiting and non-enumerating responses.

## PII exposure and privacy risks

- Address is collected only when vehicle pickup is requested; email only when provided. All other PII must have a defined operational purpose.
- Public pages must never expose CPF, full address, internal administrative data, or unnecessary booking details.
- Administrative views and APIs must use explicit permitted-field projections rather than returning whole records.
- PII must have a defined retention period and deletion path, including relevant backups, caches, analytics, and future provider copies according to the policy eventually approved.
- Encryption in transit is mandatory. Encryption at rest and key-access boundaries must be selected later based on the final architecture and this threat model.

## Administrative-area risks

- XSS could steal sessions and exfiltrate customer data; all output must be encoded and user-controlled markup must not be trusted.
- CSRF could cause status, cancellation, price, or calendar changes; state-changing operations need protection appropriate to the selected session model.
- The administrative area must use restricted CORS, security headers, generic production errors, and reauthentication for especially sensitive actions where appropriate.
- `audit-trail` must exist before sensitive administrative operations. `admin-access` must emit relevant access and session-security events; `admin-operations` must emit events for sensitive views when justified and for mutations to booking, status, catalogue, and calendar.

## Rate limiting and brute-force risks

- Apply distinct, configurable limits to login, account recovery, public tracking, and booking creation.
- Limits should combine source/origin signals with account or token signals where available; source-only limits are insufficient against distributed abuse.
- Requests must have bounded payload sizes and processing time.
- Production responses must not disclose whether a booking, token, or administrative account exists.

## Logging, audit, and secrets risks

- Never log raw CPF, full address, public tracking token, session token, credentials, authorization headers, passwords, or unnecessary PII.
- Audit events must record a minimized actor identifier, action, minimized target identifier, result, and timestamp when relevant.
- Audit events must not contain raw CPF, full address, tracking token, session token, credentials, or unnecessary PII.
- Secrets must remain outside source control, use least-privilege access, and support rotation. No secrets may be committed to Git.
- Backups must be access-restricted, protected appropriately, subject to retention rules, and restored through controlled processes.

## Recommended security boundaries

1. Separate public booking/tracking from the administrative surface.
2. Make server-side domain capabilities authoritative for prices, availability, booking confirmation, and status transitions.
3. Treat `booking-lifecycle` as the principal PII boundary, using access by field and operational purpose.
4. Treat `public-status-tracking` as a status-minimum projection, not a general booking reader.
5. Centralize administrative identity and authorization in `admin-access`, while still authorizing every action and resource at the protected operation boundary.
6. Treat `audit-trail` as an early security boundary and use its minimal contract from administrative access and operations.
7. Keep logs, analytics, backups, and future notification providers outside the PII access path unless they receive only the minimum approved information.
8. Confirm bookings only through an atomic revalidation of availability that prevents race-condition double booking and does not assume the final capacity model.

