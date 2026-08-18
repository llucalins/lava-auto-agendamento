# Car Wash Scheduling System — Confirmed Intent

## Objective

Build a secure web-based scheduling system for a car wash business.

Customers should be able to select a washing package, then view compatible available days and times, provide personal and vehicle information, choose whether they will drop off the vehicle or request pickup, choose their intended payment method, and confirm the booking.

The administrative area will be used by the car wash owner and authorized employees to manage the schedule and service status.

Security and privacy are the highest-priority non-functional requirements.

## Customer

Customer login is not required in the MVP.

The customer provides:

- Full name
- Phone / WhatsApp
- CPF
- Email when provided
- Vehicle model
- License plate
- Vehicle color

If vehicle pickup is requested, the customer must also provide a pickup address.

CPF is a required MVP product/business field. It has not been verified as a universal legal or fiscal requirement for a car-wash booking. It is personal data, but not statutory sensitive personal data under the LGPD; the project's high-risk-PII treatment is an internal security and privacy classification. Before production CPF processing is finalized, the controller must document its concrete purpose, applicable lawful basis, necessity and proportionality, and transparency obligations.

## Booking Flow

1. Select a wash package.
2. Select an available day for that package.
3. Select a compatible start time.
4. Enter personal data.
5. Enter vehicle data.
6. Choose DROP_OFF or PICKUP_REQUESTED.
7. If pickup is selected, enter the pickup address.
8. Select the intended payment method.
9. Review booking details.
10. Explicitly confirm the booking.

Package duration affects calendar eligibility and final availability. Personal data is collected only after the customer has an operationally plausible package, date, and time selection.

## Payments

The system will NOT process payments in the MVP.

The customer only selects their intended payment method.

The authoritative MVP intended-payment-method allowlist is:

- PIX
- CASH
- CREDIT_CARD
- DEBIT_CARD

Actual payment happens when the vehicle is delivered back to the customer or collected by the customer.

The application must not store:

- Credit card data
- Banking credentials
- PIX credentials
- Payment secrets

These values represent intended payment only; they do not prove that payment occurred.

## Wash Packages

Wash packages must be configurable by administrators.

Each package may contain:

- Name
- Description
- Price
- Estimated duration
- Active/inactive status

Initial duration estimates are provisional:

- Simple wash: 20–35 minutes
- Detailed wash: 35–45 minutes
- Complete wash: 45–80 minutes

These values must not be hardcoded into the architecture.

## Scheduling

Administrators must be able to configure:

- Working days
- Working hours
- Available periods
- Holidays
- Exceptional closures
- Temporary unavailable periods

The initial authoritative business timezone is America/Fortaleza. Initial use is in Paraíba, Brazil, but the product is not city-specific. The timezone is configurable and must remain a named IANA timezone rather than a hard-coded UTC offset; browser and device timezones are not authoritative.

The initial MVP capacity is N = 1 concurrent service. Availability is based on package-duration service intervals, operating availability, and confirmed intervals, not fixed booking slots. At N = 1, overlapping confirmed service intervals are not allowed; back-to-back intervals are allowed. Capacity remains configurable so a future N > 1 or resource-based model can be introduced without redefining booking semantics.

## Administration

The administrative area requires secure authentication and authorization.

Authorized administrators and employees can:

- View today's bookings
- View upcoming bookings
- View booking history
- View customer and vehicle details
- View pickup requirements
- View pickup address when required
- View selected wash package
- View price
- View intended payment method
- Update booking status
- Cancel bookings
- Configure packages
- Configure prices
- Configure package durations
- Configure operating days and hours
- Configure holidays and closures

Initial booking statuses:

- SCHEDULED
- IN_PROGRESS
- COMPLETED
- CANCELLED

Status changes should be reflected to customers in real time or near real time.

## Public Booking Tracking

Each booking must have a secure external identifier or access token.

Customers must be able to check their own booking status without logging in.

The public identifier must:

- Be cryptographically random
- Be difficult to guess
- Not be sequential
- Not expose internal database IDs
- Not allow enumeration of other bookings

Knowing an internal booking ID must never be sufficient to access private booking information.

The public tracking page must expose only the minimum information necessary.

Sensitive information such as full CPF, full address, or internal administrative data must never be exposed through the public tracking page.

Tracking remains valid while a booking is SCHEDULED or IN_PROGRESS unless revoked or replaced. It expires seven days after the authoritative transition to COMPLETED or CANCELLED; expiry does not delete the booking.

## Notifications

When a service is completed, the system should eventually support notifying the customer through:

- WhatsApp / messaging
- Email

The notification provider will be selected later.

## Security and Privacy

Security and privacy are architectural requirements, not a final hardening phase.

The system handles PII including:

- CPF
- Phone
- Email
- Address
- Vehicle license plate
- Customer identity information

A threat model must be created before architecture decisions are finalized.

At minimum, the architecture must consider:

- Data minimization
- Strong administrator authentication
- Authorization on every administrative operation
- Least privilege
- Secure session management
- Protection against brute-force attacks
- Rate limiting
- Server-side input validation
- SQL/NoSQL injection prevention
- XSS prevention
- CSRF protection where applicable
- Broken access control prevention
- IDOR prevention
- Booking enumeration prevention
- HTTPS
- Encryption in transit
- Encryption at rest where justified by the threat model
- Secure secret management
- No secrets committed to Git
- No sensitive PII in logs
- No sensitive information in analytics
- Generic production error responses
- Security headers
- Audit logging for important administrative actions
- Secure backups
- Data retention rules
- Deletion of PII when no longer required
- Secure public booking tokens
- Token expiration or revocation where appropriate

CPF, addresses and other sensitive information should only be accessible where operationally necessary.

Operational PII is retained while a booking is SCHEDULED or IN_PROGRESS. For COMPLETED or CANCELLED bookings, operational booking PII is retained for 12 months after the terminal transition, then deleted or irreversibly anonymized unless another valid purpose applies. Fiscal records have a separate purpose and lifecycle and do not justify retaining the complete operational booking record. Minimized audit records are retained for 24 months. Backups must have a finite retention period, with its exact duration still to be determined.

## Future / Out of Scope for MVP

Initially out of scope:

- Customer accounts
- Customer login
- Loyalty program
- Online payments
- Payment gateways
- Native mobile applications
- Capacity expansion beyond the initial configurable N = 1 policy

The architecture should allow these capabilities to be added later without implementing them prematurely.

## Success Criteria

A customer can securely complete a booking from a mobile browser without staff assistance.

Authorized employees can securely manage bookings and service statuses.

Administrators can configure packages, prices and operating availability without code changes.

Customers cannot access another customer's information by guessing URLs, booking IDs or identifiers.

Sensitive information is only accessible to authorized users.

Security controls are treated as architectural requirements throughout the project.
