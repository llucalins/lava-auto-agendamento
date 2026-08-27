# Database roles

`lava_migrator` is the non-superuser migration authority and owns database DDL. `lava_test` is the non-superuser runtime role: it has no database or schema `CREATE` privilege. Versioned migration `001` creates the local implementation schema `app`; the approved architecture does not prescribe its name. Migration metadata is owned by the migration authority in `public`.

`lava_test` receives only `USAGE` on `app` and, after migration `002`, `INSERT` on `app.audit_events`. It cannot update, delete, alter, drop, or create audit/schema objects. Backup/restore uses a separate operational authority and is never a runtime credential.
