import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";

const auditEventSchema = z.object({
  category: z.enum(["AUTHENTICATION", "AUTHORIZATION", "SENSITIVE_READ", "BOOKING_MUTATION", "CONFIGURATION_MUTATION", "SECURITY_FAILURE", "AUDIT_ACCESS"]),
  action: z.string().min(1).max(100).regex(/^[A-Z_]+$/), outcome: z.enum(["SUCCEEDED", "DENIED", "FAILED", "DEGRADED_AUDIT"]),
  actorRef: z.string().uuid(), targetRef: z.string().uuid(), fieldRef: z.enum(["CPF", "PICKUP_ADDRESS"]).optional(),
  correlationId: z.string().uuid().optional(), idempotencyRef: z.string().uuid().optional(), authorizationContextRef: z.string().uuid().optional(), reasonCode: z.string().min(1).max(100).regex(/^[A-Z_]+$/).optional(),
}).strict();

export type AuditEvent = z.input<typeof auditEventSchema>;

export async function writeAuditEvent(client: PoolClient, event: AuditEvent): Promise<string> {
  const value = auditEventSchema.parse(event); const eventId = randomUUID();
  await client.query("insert into app.audit_events (event_id, category, action, outcome, schema_version, actor_ref, target_ref, field_ref, correlation_id, idempotency_ref, authorization_context_ref, reason_code) values ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11)", [eventId, value.category, value.action, value.outcome, value.actorRef, value.targetRef, value.fieldRef ?? null, value.correlationId ?? null, value.idempotencyRef ?? null, value.authorizationContextRef ?? null, value.reasonCode ?? null]);
  return eventId;
}
