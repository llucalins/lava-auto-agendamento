import { z } from "zod";
import type { Pool, PoolClient } from "pg";

import { withTransaction } from "../../persistence/transaction";

const gatedDurationSchema = z.coerce.number().int().positive().max(3_650);
const jobClassSchema = z.enum([
  "IDEMPOTENCY_LINKED_PII_CAP",
  "REJECTED_CONFIRMATION_INTENTS",
  "TRACKING_SESSIONS",
  "TRACKING_VERIFIERS",
  "ABUSE_SIGNALS",
]);

export type MetadataJobClass = z.infer<typeof jobClassSchema>;
export type MetadataRetentionPolicy = Readonly<Record<MetadataJobClass, Readonly<{
  enabled: boolean;
  durationDays?: number;
  basis: "FIXED_PII_CAP" | "ROW_EXPIRY" | "EXPLICIT_APPROVAL";
}>>>;

const commandSchema = z.object({
  executionId: z.uuid(),
  jobClass: jobClassSchema,
  now: z.date(),
}).strict();

type MetadataRetentionCommand = z.input<typeof commandSchema>;
export type MetadataRetentionResult = Readonly<{ executionId: string; selectedCount: number; affectedCount: number }>;

export function loadMetadataRetentionPolicy(environment: Readonly<Record<string, string | undefined>>): MetadataRetentionPolicy {
  return Object.freeze({
    IDEMPOTENCY_LINKED_PII_CAP: Object.freeze({ enabled: true, basis: "FIXED_PII_CAP" }),
    REJECTED_CONFIRMATION_INTENTS: gated(environment, "REJECTED_INTENT_RETENTION_DAYS", "REJECTED_INTENT_RETENTION_APPROVED"),
    TRACKING_SESSIONS: gated(environment, "TRACKING_SESSION_RETENTION_DAYS", "TRACKING_SESSION_RETENTION_APPROVED"),
    TRACKING_VERIFIERS: gated(environment, "TRACKING_VERIFIER_RETENTION_DAYS", "TRACKING_VERIFIER_RETENTION_APPROVED"),
    ABUSE_SIGNALS: gated(environment, "ABUSE_SIGNAL_RETENTION_DAYS", "ABUSE_SIGNAL_RETENTION_APPROVED"),
  });
}

function gated(environment: Readonly<Record<string, string | undefined>>, durationKey: string, approvalKey: string) {
  const duration = environment[durationKey];
  const approved = environment[approvalKey];
  if (duration === undefined && approved === undefined) return Object.freeze({ enabled: false, basis: "EXPLICIT_APPROVAL" as const });
  if (approved !== "true") throw new Error(`Metadata retention gate ${approvalKey} is not approved.`);
  const parsed = gatedDurationSchema.safeParse(duration);
  if (!parsed.success) throw new Error(`Metadata retention duration ${durationKey} is invalid.`);
  return Object.freeze({ enabled: true, durationDays: parsed.data, basis: "EXPLICIT_APPROVAL" as const });
}

export function runMetadataRetention(
  pool: Pick<Pool, "connect">,
  command: MetadataRetentionCommand,
  policy: MetadataRetentionPolicy,
): Promise<MetadataRetentionResult> {
  return withTransaction(pool, (client) => runMetadataRetentionInTransaction(client, command, policy));
}

export async function runMetadataRetentionInTransaction(
  client: PoolClient,
  command: MetadataRetentionCommand,
  policy: MetadataRetentionPolicy,
): Promise<MetadataRetentionResult> {
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success || Number.isNaN(parsed.data.now.getTime()) || parsed.data.now.getTime() > Date.now() + 300_000) {
    throw new Error("Metadata retention execution is invalid.");
  }
  const selectedPolicy = policy[parsed.data.jobClass];
  if (!selectedPolicy.enabled) throw new Error("Metadata retention job is disabled pending explicit approval.");
  const cutoff = selectedPolicy.durationDays === undefined
    ? parsed.data.now
    : new Date(parsed.data.now.getTime() - selectedPolicy.durationDays * 86_400_000);

  const inserted = await client.query<{ executionId: string }>(
    `insert into app.metadata_retention_executions
       (execution_id, job_class, cutoff_at, completed_at, selected_count, affected_count, outcome)
     values ($1, $2, $3, current_timestamp, 0, 0, 'SUCCEEDED')
     on conflict (execution_id) do nothing returning execution_id as "executionId"`,
    [parsed.data.executionId, parsed.data.jobClass, cutoff],
  );
  if (!inserted.rows[0]) return readResult(client, parsed.data.executionId);

  const affectedCount = await executeJob(client, parsed.data.jobClass, cutoff, parsed.data.now);
  await client.query(
    `update app.metadata_retention_executions
       set selected_count = $2, affected_count = $2, completed_at = current_timestamp
     where execution_id = $1`,
    [parsed.data.executionId, affectedCount],
  );
  return { executionId: parsed.data.executionId, selectedCount: affectedCount, affectedCount };
}

async function executeJob(client: PoolClient, jobClass: MetadataJobClass, cutoff: Date, now: Date): Promise<number> {
  if (jobClass === "IDEMPOTENCY_LINKED_PII_CAP") {
    const result = await client.query(`with eligible as (
      select intent.intent_id from app.confirmation_intents intent
      join app.bookings booking on booking.booking_id = intent.booking_id
      where intent.lifecycle_class = 'BOOKING_TERMINAL_PII_BOUND'
        and booking.status in ('COMPLETED', 'CANCELLED')
        and booking.terminal_transition_at <= $1::timestamptz - interval '12 months'
      order by booking.terminal_transition_at, intent.intent_id limit 500 for update of intent skip locked
    ) delete from app.confirmation_intents intent using eligible
      where intent.intent_id = eligible.intent_id returning intent.intent_id`, [now]);
    return result.rowCount ?? 0;
  }
  if (jobClass === "REJECTED_CONFIRMATION_INTENTS") {
    const result = await client.query(`with eligible as (
      select intent_id from app.confirmation_intents
      where lifecycle_class = 'REJECTED_BOUNDED' and expires_at <= $2 and completed_at <= $1
      order by expires_at, intent_id limit 500 for update skip locked
    ) delete from app.confirmation_intents intent using eligible
      where intent.intent_id = eligible.intent_id returning intent.intent_id`, [cutoff, now]);
    return result.rowCount ?? 0;
  }
  if (jobClass === "TRACKING_SESSIONS") {
    const result = await client.query(`with eligible as (
      select session_verifier from app.tracking_sessions
      where expires_at <= $1 order by expires_at, session_verifier limit 500 for update skip locked
    ) delete from app.tracking_sessions session using eligible
      where session.session_verifier = eligible.session_verifier returning session.session_verifier`, [cutoff]);
    return result.rowCount ?? 0;
  }
  if (jobClass === "TRACKING_VERIFIERS") return removeExpiredTrackingVerifiers(client, cutoff);
  const result = await client.query(`with eligible as (
    select signal_id from app.abuse_signals where occurred_at <= $1
    order by occurred_at, signal_id limit 500 for update skip locked
  ) delete from app.abuse_signals signal using eligible
    where signal.signal_id = eligible.signal_id returning signal.signal_id`, [cutoff]);
  return result.rowCount ?? 0;
}

async function removeExpiredTrackingVerifiers(client: PoolClient, cutoff: Date): Promise<number> {
  const selected = await client.query<{ bookingId: string }>(`select booking_id as "bookingId"
    from app.bookings where status in ('COMPLETED', 'CANCELLED')
      and terminal_transition_at + interval '7 days' <= $1
      and exists (select 1 from app.tracking_credentials c where c.booking_id = bookings.booking_id)
    order by terminal_transition_at, booking_id limit 500 for update skip locked`, [cutoff]);
  const bookingIds = selected.rows.map((row) => row.bookingId);
  if (bookingIds.length === 0) return 0;
  await client.query(`delete from app.tracking_sessions where credential_id in
    (select credential_id from app.tracking_credentials where booking_id = any($1::uuid[]))`, [bookingIds]);
  await client.query("delete from app.tracking_issuances where booking_id = any($1::uuid[])", [bookingIds]);
  await client.query(`update app.tracking_credentials set state = 'REVOKED', replaced_by = null,
    revoked_at = coalesce(revoked_at, current_timestamp)
    where booking_id = any($1::uuid[]) and state = 'REPLACED'`, [bookingIds]);
  const deleted = await client.query("delete from app.tracking_credentials where booking_id = any($1::uuid[]) returning credential_id", [bookingIds]);
  return deleted.rowCount ?? 0;
}

async function readResult(client: PoolClient, executionId: string): Promise<MetadataRetentionResult> {
  const existing = await client.query<MetadataRetentionResult>(`select execution_id as "executionId",
    selected_count as "selectedCount", affected_count as "affectedCount"
    from app.metadata_retention_executions where execution_id = $1`, [executionId]);
  if (!existing.rows[0]) throw new Error("Metadata retention execution is unavailable.");
  return existing.rows[0];
}
