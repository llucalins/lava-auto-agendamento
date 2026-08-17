# Spec: admin-access

## Status

Draft for human review. This is the Phase 1 specification for `admin-access` only. It does not authorize planning, implementation, or work on another module.

## Objective

Provide secure individual administrative identity, authentication, sessions, roles, permissions, and authorization boundaries for the car-wash owner and authorized employees. Security is the primary objective: authentication establishes identity but never grants unrestricted administrative or PII access.

`admin-access` consumes the approved `audit-trail` contract for security events and complies with the cross-cutting `privacy-governance` policy. It does not define audit persistence, booking behavior, catalogue/calendar mutation, or notification delivery.

## Scope

This specification defines:

- Individual administrative accounts, account lifecycle, authentication, recovery, sessions, roles, permissions, and protected-operation authorization.
- Least-privilege access to administrative data, including explicit permissions for CPF and pickup addresses.
- Brute-force, credential-stuffing, enumeration, shared-device, session theft/fixation, CSRF, XSS, secrets, and compromised-account protections.
- Required integration with `audit-trail`, including its durable-audit consistency and failure classification.

## Non-goals

- Customer accounts or customer login.
- Choosing a web framework, database, authentication/MFA/email vendor, cloud provider, session-store technology, password library, or recovery-delivery mechanism.
- Specifying `booking-lifecycle`, `admin-operations`, audit persistence, provider integration, or implementation tasks.
- Defining arbitrary password complexity values, MFA product choice, session duration values, legal retention periods, or Brazilian compliance conclusions.

## Administrative identity model

- Every owner and employee uses an individual administrative account. Shared credentials and shared administrative accounts are prohibited.
- Accounts have a stable internal account identifier, lifecycle state, assigned roles/permissions, and a separately controlled authentication credential.
- Authentication proves only the account identity. Authorization determines whether that authenticated account may perform an action on a resource and, where relevant, view a sensitive field.
- Disabled, revoked, or compromised accounts must not establish new authenticated sessions or retain active access.

## Administrative account bootstrap and registration

- There is no public administrative registration. Administrative accounts must not be created through an unauthenticated public signup flow.
- After initial system bootstrap, a new administrative account may be created only through an explicitly authorized administrative lifecycle operation.
- The first `OWNER` account requires a controlled bootstrap process that the eventual architecture must specify.
- Bootstrap must not create a permanent bypass, default credential, hidden backdoor, or reusable setup secret.
- The bootstrap mechanism, its assurance requirements, and its audit/recovery path are deferred; it must be a controlled one-time or otherwise non-reusable process before implementation.

## Proposed initial roles and permission boundaries

These are proposed minimum roles for human approval. They do not grant permissions by role name alone; each protected operation remains authorized server-side.

| Role | Primary responsibility | Default permitted scope | Explicitly excluded by default |
|---|---|---|---|
| `OWNER` | Business ownership, staff administration, and high-impact business configuration | Manage employee accounts; grant/revoke permissions; view and manage bookings; configure packages/prices/calendar; view audit records only if separately granted an audit-reader permission | No exemption from audit, least privilege, sensitive-field authorization, or durable-audit requirements |
| `EMPLOYEE` | Day-to-day authorized service operations | View/manage only the booking information and status actions explicitly assigned to the employee permission set | Grant/revoke roles or permissions; manage accounts; change prices, packages, or operating calendar; read audit records; view CPF or pickup address without explicit field permission |

The proposed permission model contains at least these independently assignable scopes:

- Booking operational read and status update.
- Booking cancellation.
- Sensitive field read: CPF.
- Sensitive field read: pickup address.
- Package configuration, including price and duration.
- Operating-calendar configuration, including holidays, closures, and availability.
- Employee account lifecycle management.
- Role/permission administration.
- Audit-record read/search/export when later approved.

Owner and employee responsibilities, including whether an employee may cancel bookings or manage any configuration, require human approval before implementation.

## Least privilege and authorization model

- Every protected server-side operation must authorize the **actor**, **action**, **target resource**, and **sensitive fields** where applicable.
- Authorization is default-deny. If an actor, permission, action, resource scope, field permission, role mapping, or authorization rule is missing, unknown, stale, or not explicitly granted, the server must deny the operation.
- Authentication alone never grants access to all administrative data.
- Authorization must be evaluated server-side for every protected request; client routes, hidden controls, and client-side state are not security boundaries.
- Client-side visibility or route access never changes the default-deny rule.
- CPF and pickup-address access require explicit sensitive-field permissions, not merely an authenticated employee session or generic booking-read permission.
- Resource-level checks must prevent IDOR: changing an internal identifier must never expand a user's authorized booking, configuration, account, or audit scope.
- Ordinary employees must not grant themselves roles or permissions, mutate their own privileged scopes, or perform a privilege change unless an explicitly authorized higher-privilege workflow is later approved.
- Role/permission changes require durable audit confirmation under `SPEC-audit-trail.md` and must not be reported successful without it.

## Authentication and credential requirements

- Authentication must use a server-verified credential flow and TLS-protected transport.
- Plaintext passwords must never be stored, logged, exported, or placed in audit events.
- Passwords must be stored only as salted, adaptive, one-way password-verifier outputs using a later-approved modern password-hashing mechanism.
- Password policy must prioritize resistance to guessing and reuse without inventing arbitrary composition rules. It must support adequate length and reject clearly weak/compromised credentials where the later architecture supports it.
- Password acceptance rules may be clearly communicated to legitimate users. Security must not rely on password-policy secrecy.
- Outward authentication/recovery responses must still avoid account enumeration, credential-state disclosure, verifier details, security-control internals, or sensitive implementation information.
- Authentication errors must be generic and externally consistent so that login, recovery, activation, and disabled-account responses do not enumerate accounts or reveal credential state.
- Authentication endpoints require distinct, stricter rate limiting and abuse controls than ordinary authenticated traffic.

## MFA requirements and policy

- MFA is mandatory for all administrative accounts, including `OWNER` and `EMPLOYEE`; the concrete factor, provider, enrollment, recovery, and implementation remain deferred.
- An administrative account subject to mandatory MFA must not receive normal authenticated administrative access until required MFA enrollment and verification are complete.
- MFA must be resistant to recovery flows becoming a weaker substitute for the primary authentication boundary.
- MFA policy must not depend only on an account's current permission set, preventing unsafe transitions when permissions change.
- MFA enrollment, factor reset, factor loss, and bypass requests are security-sensitive account-recovery actions and must be rate-limited, authorized, and audited without logging factors, recovery tokens, or secrets.

## Session security

### Creation, storage, and transport

- A session is created only after successful server-side authentication and any required MFA verification.
- Session identifiers and authentication secrets must never be stored in browser `localStorage`, `sessionStorage`, URLs, client-visible script state, logs, analytics, telemetry, or audit events.
- Browser sessions must use secure, `httpOnly`, HTTPS-only cookies with an appropriate `SameSite` policy. The concrete framework/library configuration is deferred.
- Session state must be validated server-side. Storage technology remains deferred.

### Expiration, rotation, logout, and revocation

- Sessions require both a finite maximum lifetime and an idle-timeout policy; exact durations require human approval based on operational risk and shared-device use.
- Session identifiers must rotate on authentication and other security-boundary transitions to resist session fixation. The later architecture must define any additional rotation points.
- Logout must invalidate the session server-side, not merely clear client state.
- Account disablement, privilege reduction, suspected compromise, credential reset, and MFA-factor reset must revoke affected active sessions server-side according to the approved recovery/incident process.

### Theft and shared-device risks

- The design must protect against session theft through XSS, insecure cookies, token leakage, device sharing, and unattended browser sessions.
- Owner and employee use of a shared computer is an explicit risk: the system must provide clear logout, server-side revocation, finite idle/max session lifetime, no persistent browser-stored secrets, and no assumption that browser-profile separation alone is sufficient.
- The human must decide whether additional shared-device controls, such as reauthentication before sensitive reads/actions or restrictions on persistent sessions, are required for the business environment.

## Brute-force, credential-stuffing, enumeration, and lockout

- Authentication, MFA verification, and recovery endpoints require rate limits and throttling that are stricter than normal authenticated traffic.
- Abuse controls must consider account and source signals where available; source-only controls are insufficient against distributed attacks, and account-only controls can enable denial of service.
- Responses must avoid revealing whether an account exists, is disabled, has MFA enrolled, or is eligible for recovery.
- Lockout/throttling must reduce guessing without enabling trivial account-denial attacks. Exact thresholds, delay/lockout policy, challenge mechanisms, and recovery handling require later architecture approval.
- Security-relevant authentication failures, suspicious patterns, and protection-triggered denials must emit minimized audit events as required by `audit-trail`.

## Account recovery and compromised-account response

- Account recovery must require assurance at least as strong as the primary authentication boundary; it must not bypass MFA or privilege protections without an explicitly approved recovery policy.
- Recovery requests, token/factor resets, and recovery completion must use generic outward responses, abuse controls, expiration/single-use principles where applicable, server-side invalidation, and audit coverage without recording credentials, tokens, or raw request data.
- A suspected or confirmed compromised account requires: immediate server-side revocation of active sessions; suspension or restriction of new access as appropriate; credential and MFA-factor recovery through a controlled flow; review of recent relevant audit events; and an authorized, audited restoration decision.
- The incident workflow, identity-proofing method, delivery channel, and notification mechanism are deferred. They must not be weaker than normal authentication.

## Privilege changes, active sessions, and step-up authentication

- For privilege reduction, removed access must stop being usable by active sessions immediately at the approved authorization boundary.
- For privilege elevation, an existing session must not silently gain sensitive or high-impact authority based on stale or embedded permission state. Authorization must use current server-authoritative permissions.
- Sensitive privilege elevation requires an appropriate reauthentication or assurance transition. The eventual architecture must define session rotation, revalidation, revocation, and propagation behavior without choosing the mechanism here.
- The eventual architecture must define step-up or recent-authentication requirements for role/permission administration, MFA reset/change, account-recovery completion, disabling or materially changing another `OWNER`, audit export if later approved, and security-configuration changes.
- Reauthentication is not required for every ordinary booking or status operation unless later threat modeling justifies it. The concrete assurance mechanism and time window remain deferred.

## CSRF, XSS, headers, and secrets

- State-changing administrative operations require CSRF protection appropriate to the eventual session model.
- User-controlled content must be encoded/sanitized at rendering boundaries; administrative pages must not use untrusted content in executable or raw HTML contexts. This protects sessions from XSS theft.
- The administrative surface requires security headers appropriate to the final framework, including a restrictive Content Security Policy, HTTPS transport enforcement, clickjacking protection, MIME-sniffing protection, and a restrictive referrer policy. Exact syntax/configuration is deferred.
- Authentication/session secrets, password-verifier inputs, MFA factors, recovery tokens, signing keys, and provider credentials must be stored outside source control, restricted by least privilege, and excluded from logs/audit records.
- Production authentication errors must be generic and must not reveal account existence, authentication state, policy internals, session details, stack traces, or security configuration.

## Audit-trail integration

`admin-access` must emit only validated, minimized, server-authoritative event envelopes to `audit-trail`.

- Authentication successes/failures and security-relevant session/account events emit `AUTHENTICATION` events.
- Protected-operation authorization denials and privilege-related denials emit `AUTHORIZATION` events when security-relevant.
- Role/permission grants, revocations, and other privilege changes emit durable-confirmation audit events.
- CPF and pickup-address access requires `SENSITIVE_READ` events; durable audit acceptance must occur before the sensitive value is released.
- Initial bootstrap, administrative account creation, activation, disablement, privilege elevation/reduction, MFA enrollment/reset, recovery completion, session revocation, and compromised-account handling emit the approved security-relevant event categories. These events must not log secrets, factors, credentials, tokens, raw request data, or complete account records.
- No audit event from this module may contain passwords, password-verifier data, MFA factors, recovery tokens, session tokens, authorization headers, CPF, addresses, raw request data, or complete account records.
- Audit persistence failures follow the risk classification in `SPEC-audit-trail.md`: durable-confirmation actions do not complete without durable audit acceptance; operations assigned to later architecture approval do not receive an implicit default.

## Administrative account lifecycle

- Account creation, activation, role assignment, permission changes, disablement, re-enablement, credential reset, MFA changes, and termination/offboarding are protected lifecycle actions.
- Disablement and offboarding must revoke active sessions and prevent new sessions before access is considered removed.
- Privilege reduction must take effect on active authorization decisions; the exact propagation mechanism is deferred, but stale privileges must not remain usable after the approved change boundary.
- Lifecycle and privilege actions require least privilege, durable auditing where classified, and generic outward errors.
- The system must not allow ordinary administrative workflows to disable, delete, or remove the required account/privilege-management capability from the last active recovery-capable `OWNER`.
- Transfer or removal of the last active recovery-capable `OWNER` requires a controlled, explicitly approved lifecycle/recovery process. This safeguard must not create a hidden bypass account, permanent elevated credential, or reusable bootstrap secret.

## Technology, commands, project structure, code style, and testing

- **Tech stack:** Deferred. No web framework, database, authentication/MFA/email vendor, cloud provider, session-store technology, password library, or recovery delivery mechanism is selected.
- **Commands:** Not applicable. This is a policy/contract specification and creates no executable artifact.
- **Project structure:** Deferred. No implementation layout is selected.
- **Code style:** Not applicable. No application code or interface binding is selected.
- **Testing and verification expectations:** Future implementation must verify individual-account isolation; password verifier handling; generic authentication/recovery errors; rate limits; session fixation/theft protections; secure-cookie invariants; server-side logout/revocation; MFA policy enforcement; authorization by actor/action/resource/field; CPF/address denial and audited release; privilege-escalation prevention; CSRF/XSS/header protections; shared-device behavior; compromised-account response; and every applicable audit failure class. Tests/demos must use synthetic data and never production PII by default.

## Acceptance criteria

- [ ] Administrative identities are individual accounts; shared credentials are prohibited.
- [ ] There is no public administrative registration; bootstrap is controlled, non-reusable, and cannot create a default credential, hidden backdoor, permanent bypass, or reusable setup secret.
- [ ] Authentication alone does not authorize unrestricted administrative data access.
- [ ] Every protected operation authorizes actor, action, target resource, and sensitive field where applicable, server-side.
- [ ] Default-deny is enforced when authorization data/rules are missing, unknown, stale, or ungranted, regardless of client-side route or UI visibility.
- [ ] CPF and pickup-address access require explicit field-level permissions and durable audit acceptance before disclosure.
- [ ] Ordinary employees cannot grant themselves roles/permissions or access audit records by default.
- [ ] Privilege changes require durable audit confirmation and cannot silently diverge from their audit event.
- [ ] Passwords are never plaintext; credentials/tokens/secrets are excluded from browser storage, logs, analytics, telemetry, and audit records.
- [ ] Sessions use server-side validation, secure `httpOnly` HTTPS-only cookies, finite maximum and idle lifetimes, rotation at security boundaries, server-side logout, and revocation on disablement/compromise/recovery events.
- [ ] Privilege reductions stop access for active sessions at the approved authorization boundary; sensitive privilege elevations require a defined assurance transition and current server-authoritative authorization.
- [ ] Authentication, MFA, and recovery controls resist brute force, credential stuffing, account enumeration, recovery abuse, session fixation, theft, and shared-device risks.
- [ ] Authentication errors are generic; authentication rate limits are distinct from normal authenticated traffic.
- [ ] Recovery is not weaker than normal authentication and compromised-account response revokes sessions and controls restoration.
- [ ] Required authentication, authorization-denial, privilege, sensitive-read, recovery, and account-security events use the approved audit contract without prohibited fields.
- [ ] Admin CSRF, XSS, security-header, secret-handling, and generic-error invariants are specified without a framework choice.
- [ ] MFA is mandatory for every administrative account before normal administrative access; enrollment, factor, provider, recovery, and reset mechanisms remain explicitly unresolved.
- [ ] The last active recovery-capable `OWNER` cannot be removed or stripped of account/privilege-management capability through ordinary administrative workflows.
- [ ] Step-up/recent-authentication requirements are defined before implementation for role/permission administration, MFA changes, recovery completion, material `OWNER` changes, approved audit export, and security configuration.
- [ ] Bootstrap, account lifecycle, privilege, MFA, recovery, and compromise events comply with the approved audit contract without prohibited fields.

## Boundaries

### Always

- Authenticate server-side and authorize every protected operation by actor, action, resource, and sensitive field when applicable.
- Use individual accounts, least privilege, explicit CPF/pickup-address permissions, and generic authentication/recovery errors.
- Protect sessions with secure `httpOnly` HTTPS-only cookies, server-side validation/revocation, rotation at security boundaries, and no browser storage of authentication secrets.
- Apply distinct abuse controls to authentication/MFA/recovery endpoints and emit required minimized audit events.
- Treat recovery, MFA changes, privilege changes, disablement, and compromise response as security-sensitive actions.
- Follow `audit-trail` durable-confirmation and failure-mode requirements.
- Enforce default-deny and derive authorization from current server-authoritative permissions.
- Require MFA enrollment/verification before normal administrative access for every administrative account.
- Preserve the last active recovery-capable `OWNER` safeguard and use controlled, approved transfer/removal only.
- Audit bootstrap, account creation/activation/disablement, privilege elevation/reduction, MFA enrollment/reset, and recovery completion without secrets.

### Ask First

- Defining final owner/employee permissions, granting CPF/address/audit-reader access, or allowing employees to cancel bookings or change configuration.
- Selecting an MFA factor, provider, enrollment approach, recovery channel, factor-reset process, or bootstrap mechanism.
- Setting session duration/idle timeout, lockout/throttling thresholds, recovery identity proofing, or shared-device reauthentication rules.
- Adding an authentication flow, federation, external identity service, recovery method, role, permission, elevated privilege, or security-sensitive browser/storage mechanism.
- Selecting framework, database, authentication/session/MFA/email/cloud/session-store technology.

### Never

- Store plaintext passwords or put passwords, password-verifier data, session tokens, recovery tokens, MFA factors, authorization headers, credentials, CPF, addresses, or raw request data in logs, analytics, telemetry, or audit events.
- Store sessions or authentication secrets in browser `localStorage`, `sessionStorage`, URLs, or client-visible script state.
- Treat authenticated status, client-side checks, hidden UI controls, role names, or internal resource IDs as sufficient authorization.
- Allow ordinary employees to self-grant privileges, mutate their own elevated permissions, edit audit records, or bypass durable audit requirements.
- Make recovery weaker than main authentication or reveal account existence/state through outward errors.
- Allow unauthenticated public administrative signup, a permanent bootstrap bypass, a default credential, hidden backdoor, or reusable setup secret.
- Allow missing, unknown, stale, or ungranted authorization information to permit an operation.
- Remove the last active recovery-capable `OWNER` or its account/privilege-management capability through an ordinary administrative workflow.
- Choose technology or implement an authentication/session/recovery mechanism under this specification.

## Open questions requiring human approval

1. Confirm the proposed owner and employee scopes, especially employee booking cancellation, package/calendar configuration, audit-read access, CPF access, and pickup-address access.
2. Which MFA factor, enrollment, recovery, factor-reset, and delivery mechanisms meet the mandatory-MFA policy?
3. What maximum session lifetime, idle timeout, recent-authentication triggers, and shared-device controls fit the business environment?
4. What recovery identity-proofing, bootstrap, last-owner transfer/removal, and incident escalation processes can meet or exceed the primary authentication assurance level?
5. What throttle/lockout/challenge policy balances credential-stuffing resistance against employee lockout and account-denial abuse?
6. Which Brazilian legal requirements affect employee identity data, authentication logs, recovery data, audit access, retention, or breach response? This requires later `source-driven-development` verification using current official Brazilian sources.
