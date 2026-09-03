import { createHash } from "node:crypto";

import type { Pool } from "pg";

export type PublicTrackingStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface TrackingStatusProjection {
  status: PublicTrackingStatus;
}

const sessionPattern = /^[A-Za-z0-9_-]{43}$/;
const statuses = new Set<PublicTrackingStatus>(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export async function readTrackingStatus(
  pool: Pick<Pool, "query">,
  cookieValue: string,
): Promise<TrackingStatusProjection | null> {
  if (!sessionPattern.test(cookieValue)) return null;
  const result = await pool.query<{ status: string }>(
    'select status from app.read_current_tracking_status($1)',
    [createHash("sha256").update(cookieValue).digest("hex")],
  );
  const status = result.rows[0]?.status;
  return status && statuses.has(status as PublicTrackingStatus)
    ? { status: status as PublicTrackingStatus }
    : null;
}
