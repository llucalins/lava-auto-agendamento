# Capability Map: Car Wash Scheduling

## Dependency types

- **Runtime/software dependency:** a module requires another module's capability while operating.
- **Policy dependency:** a module must comply with a cross-cutting governance policy without a runtime coupling to that policy capability.

| Module id | Responsibility | Runtime/software dependencies | Policy dependencies | Handles PII? | Recommended build order |
|---|---|---|---|---:|---:|
| `privacy-governance` | Cross-cutting governance capability for data classification, minimization, retention, deletion, exposure rules, and PII handling. It is not a runtime coupling between domains. | — | — | Yes | 1 |
| `audit-trail` | Minimal audit contract and security-event recording, available before sensitive administrative operations are implemented. | — | `privacy-governance` | Only minimized identifiers when necessary | 2 |
| `admin-access` | Administrative identity, authentication, sessions, and roles/permissions; emits events through `audit-trail`. | `audit-trail` | `privacy-governance` | Yes | 3 |
| `service-catalog` | Configurable packages: name, description, price, duration, and active status. Public booking may read it; protected mutations are enforced through `admin-operations` and `admin-access`. | — | — | No | 4 |
| `operating-calendar` | Working days/hours, available periods, holidays, closures, and temporary unavailability. Public booking may read it; protected mutations are enforced through `admin-operations` and `admin-access`. It does not assume final simultaneous capacity. | — | — | No | 5 |
| `booking-lifecycle` | Protected booking record, customer, vehicle, pickup/address when applicable, intended payment method, and status. Booking confirmation atomically revalidates availability and prevents race-condition double booking without assuming the final capacity model. | `service-catalog`, `operating-calendar`, `audit-trail` | `privacy-governance` | Yes | 6 |
| `public-booking-flow` | Public availability lookup and booking creation. It is not authoritative for price, availability, or confirmation. | `service-catalog`, `operating-calendar`, `booking-lifecycle` | `privacy-governance` | Yes | 7 |
| `public-status-tracking` | Status-minimum public view using a secure external token; never exposes internal IDs or private details. | `booking-lifecycle` | `privacy-governance` | Yes, with strictly minimal exposure | 8 |
| `admin-operations` | Protected booking views and management, status updates, cancellations, and mutations to catalogue/calendar. Emits events through `audit-trail`. | `admin-access`, `audit-trail`, `booking-lifecycle`, `service-catalog`, `operating-calendar` | `privacy-governance` | Yes | 9 |
| `customer-notifications` | Future customer updates through email/WhatsApp with only necessary data; provider remains undecided. | `booking-lifecycle` | `privacy-governance` | Yes | After MVP |

## Build order

`privacy-governance` → `audit-trail` → (`admin-access`, `service-catalog`, `operating-calendar`) → `booking-lifecycle` → (`public-booking-flow`, `public-status-tracking`) → `admin-operations` → `customer-notifications`.

