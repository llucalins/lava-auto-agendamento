# Database roles

`lava_migrator` is the non-superuser migration authority and owns database DDL. `lava_test` is the non-superuser runtime role: it has no database or schema `CREATE` privilege. Versioned migration `001` creates the local implementation schema `app`; the approved architecture does not prescribe its name. Migration metadata is owned by the migration authority in `public`.

`lava_test` receives only `USAGE` on `app` and, after migration `002`, `INSERT` on `app.audit_events`. It cannot update, delete, alter, drop, or create audit/schema objects. Backup/restore uses a separate operational authority and is never a runtime credential.

After migration `020`, `lava_test` no longer has table-wide `SELECT` on `app.booking_customer_vehicle_pii`. Ordinary operational reads retain column-level access to the approved non-sensitive projection, while raw CPF and pickup address are available only through the narrowly executable `app.read_authorized_sensitive_field` security-definer function. That function has a fixed trusted `search_path`, is not executable by `PUBLIC`, requires the exact durable disclosure-authorization audit tuple, and rechecks and locks current session, account, MFA, role/field permission, booking, and authorization-version state before selecting only the requested field.

Tracking lifecycle tables introduced by migration `021` have no direct runtime table grants. `lava_test` can only activate, replace, revoke, or check a credential version through narrowly granted security-definer functions with fixed trusted `search_path` values. The functions store verifier-only state, serialize one-active-credential decisions on the booking row, and revoke sessions bound to an invalidated credential version.
