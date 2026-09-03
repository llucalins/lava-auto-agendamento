import type { Pool } from "pg";

const CALENDAR_CONFIRMATION_LOCK = 270_034;

export async function acquireCalendarConfirmationLock(
  pool: Pick<Pool, "query">,
  mode: "CONFIRMATION" | "MUTATION",
): Promise<void> {
  await pool.query(
    mode === "CONFIRMATION" ? "select pg_advisory_xact_lock_shared($1)" : "select pg_advisory_xact_lock($1)",
    [CALENDAR_CONFIRMATION_LOCK],
  );
}
