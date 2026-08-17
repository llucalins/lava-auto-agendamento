# Car Wash Scheduling System — Confirmed Intent

## Objective

Build a secure web-based scheduling system for a car wash business.

Customers should be able to view available days and times, provide personal and vehicle information, choose whether they will drop off the vehicle or request pickup, select a washing package, choose their intended payment method, and confirm the booking.

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

## Booking Flow

1. View available days.
2. Select a day.
3. View available times.
4. Select a time.
5. Enter customer information.
6. Enter vehicle information.
7. Choose between:
   - Drop off the vehicle
   - Request vehicle pickup
8. If pickup is selected, provide the pickup address.
9. View available wash packages and prices.
10. Select a package.
11. Select the intended payment method.
12. Review booking details.
13. Confirm the booking.

## Payments

The system will NOT process payments in the MVP.

The customer only selects their intended payment method.

Actual payment happens when the vehicle is delivered back to the customer or collected by the customer.

The application must not store:

- Credit card data
- Banking credentials
- PIX credentials
- Payment secrets

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

The final simultaneous vehicle capacity is not yet known.

The architecture must not assume a fixed capacity prematurely.

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

## Future / Out of Scope for MVP

Initially out of scope:

- Customer accounts
- Customer login
- Loyalty program
- Online payments
- Payment gateways
- Native mobile applications
- Final simultaneous vehicle capacity model

The architecture should allow these capabilities to be added later without implementing them prematurely.

## Success Criteria

A customer can securely complete a booking from a mobile browser without staff assistance.

Authorized employees can securely manage bookings and service statuses.

Administrators can configure packages, prices and operating availability without code changes.

Customers cannot access another customer's information by guessing URLs, booking IDs or identifiers.

Sensitive information is only accessible to authorized users.

Security controls are treated as architectural requirements throughout the project.