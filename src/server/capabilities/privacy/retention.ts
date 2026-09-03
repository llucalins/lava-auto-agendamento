import { z } from "zod";
import type { Pool, PoolClient } from "pg";

import { withTransaction } from "../../persistence/transaction";

const commandSchema = z.object({
  executionId: z.uuid(),
  jobClass: z.enum(["TERMINAL_PII_12_MONTHS", "AUDIT_24_MONTHS"]),
  now: z.date(),
}).strict();

type RetentionCommand = z.input<typeof commandSchema>;
export type RetentionResult = Readonly<{ executionId: string; selectedCount: number; deletedCount: number }>;

export function runFixedRetention(pool: Pick<Pool, "connect">, command: RetentionCommand): Promise<RetentionResult> {
  return withTransaction(pool, (client) => runFixedRetentionInTransaction(client, command));
}

export async function runFixedRetentionInTransaction(client: PoolClient, command: RetentionCommand): Promise<RetentionResult> {
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success || Number.isNaN(parsed.data.now.getTime()) || parsed.data.now.getTime() > Date.now() + 300_000) {
    throw new Error("Retention execution is invalid.");
  }
  const cutoffInterval = parsed.data.jobClass === "TERMINAL_PII_12_MONTHS" ? "12 months" : "24 months";
  const cutoff = await client.query<{ cutoff: Date }>(
    "select $1::timestamptz - $2::interval as cutoff",
    [parsed.data.now, cutoffInterval],
  );
  const inserted = await client.query<{ executionId: string }>(
    `insert into app.retention_executions (
       execution_id, job_class, cutoff_at, completed_at, selected_count, affected_count, outcome
     ) values ($1, $2, $3, current_timestamp, 0, 0, 'SUCCEEDED')
     on conflict (execution_id) do nothing returning execution_id as "executionId"`,
    [parsed.data.executionId, parsed.data.jobClass, cutoff.rows[0]!.cutoff],
  );
  if (!inserted.rows[0]) return readResult(client, parsed.data.executionId);

  const deleted = parsed.data.jobClass === "TERMINAL_PII_12_MONTHS"
    ? await client.query(`with eligible as (
        select pii.booking_id
        from app.booking_customer_vehicle_pii pii
        join app.bookings booking on booking.booking_id = pii.booking_id
        where booking.status in ('COMPLETED', 'CANCELLED') and booking.terminal_transition_at < $1
        order by booking.terminal_transition_at, pii.booking_id
        limit 500 for update of pii skip locked
      ) delete from app.booking_customer_vehicle_pii pii using eligible
        where pii.booking_id = eligible.booking_id returning pii.booking_id`, [cutoff.rows[0]!.cutoff])
    : await client.query(`with eligible as (
        select event_id from app.audit_events where occurred_at < $1
        order by occurred_at, event_id limit 500 for update skip locked
      ) delete from app.audit_events event using eligible
        where event.event_id = eligible.event_id returning event.event_id`, [cutoff.rows[0]!.cutoff]);

  await client.query(
    `update app.retention_executions
     set selected_count = $2, affected_count = $2, completed_at = current_timestamp
     where execution_id = $1`,
    [parsed.data.executionId, deleted.rowCount ?? 0],
  );
  return { executionId: parsed.data.executionId, selectedCount: deleted.rowCount ?? 0, deletedCount: deleted.rowCount ?? 0 };
}

async function readResult(client: PoolClient, executionId: string): Promise<RetentionResult> {
  const existing = await client.query<{ executionId: string; selectedCount: number; deletedCount: number }>(
    `select execution_id as "executionId", selected_count as "selectedCount", affected_count as "deletedCount"
     from app.retention_executions where execution_id = $1`,
    [executionId],
  );
  if (!existing.rows[0]) throw new Error("Retention execution is unavailable.");
  return existing.rows[0];
}
