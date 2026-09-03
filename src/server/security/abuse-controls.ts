import type { RouteClass } from "./resource-controls";

export type AbuseDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };
export type AbuseCheck = Readonly<{ routeClass: RouteClass; signalRefs: readonly string[] }>;
export type SharedAbuseProvider = Readonly<{ check: (request: AbuseCheck) => Promise<AbuseDecision> }>;

export type AbuseControl = Readonly<{
  enforcement: "SHARED_EDGE_PROVIDER" | "PROCESS_LOCAL_DEFENSE_IN_DEPTH";
  check: (request: AbuseCheck) => Promise<AbuseDecision>;
}>;

export function createAbuseControl(options: {
  provider?: SharedAbuseProvider;
  limit?: number;
  windowMs?: number;
  now?: () => number;
}): AbuseControl {
  if (options.provider) {
    return { enforcement: "SHARED_EDGE_PROVIDER", check: (request) => options.provider!.check(validate(request)) };
  }

  const limit = options.limit ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1_000) throw new Error("Abuse control configuration is invalid.");
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const now = options.now ?? Date.now;

  return {
    enforcement: "PROCESS_LOCAL_DEFENSE_IN_DEPTH",
    async check(request) {
      const checked = validate(request);
      const time = now();
      const key = `${checked.routeClass}:${checked.signalRefs.join(":")}`;
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= time) {
        if (buckets.size >= 10_000) {
          for (const [candidate, value] of buckets) if (value.resetAt <= time) buckets.delete(candidate);
        }
        buckets.set(key, { count: 1, resetAt: time + windowMs });
        return { allowed: true };
      }
      bucket.count += 1;
      return bucket.count <= limit
        ? { allowed: true }
        : { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - time) / 1_000)) };
    },
  };
}

function validate(request: AbuseCheck): AbuseCheck {
  if (request.signalRefs.length < 2 || request.signalRefs.length > 4 || request.signalRefs.some((value) => !/^[a-z]+:[A-Za-z0-9_-]{1,128}$/.test(value))) {
    throw new Error("Abuse signal is invalid.");
  }
  return request;
}
