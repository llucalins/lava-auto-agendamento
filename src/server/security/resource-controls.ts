export type RouteClass = "availability" | "booking-confirmation" | "tracking-proof" | "oidc" | "admin-read";

export const routeResourcePolicies = Object.freeze({
  availability: { maxQueryBytes: 4_096, maxDateWindowDays: 31, maxResults: 32, maxConcurrent: 32 },
  "booking-confirmation": { maxBodyBytes: 16_384, maxConcurrent: 16 },
  "tracking-proof": { maxBodyBytes: 1_024, maxConcurrent: 16 },
  oidc: { maxQueryBytes: 4_096, maxConcurrent: 8 },
  "admin-read": { maxPageSize: 100, maxDateWindowDays: 31, maxConcurrent: 32 },
});

export class ResourceLimitError extends Error {
  constructor(readonly code: "INVALID_BOUND" | "BODY_TOO_LARGE" | "OVERLOADED" | "RETRY_EXHAUSTED") {
    super("Request cannot be processed.");
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new ResourceLimitError("INVALID_BOUND");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new ResourceLimitError("BODY_TOO_LARGE");
  }
  if (!request.body) throw new ResourceLimitError("INVALID_BOUND");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ResourceLimitError("BODY_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ResourceLimitError) throw error;
    throw new ResourceLimitError("INVALID_BOUND");
  } finally {
    reader.releaseLock();
  }
}

export function parseBoundedPage(pageValue: string | null, pageSizeValue: string | null, maxPageSize: number) {
  const page = Number(pageValue ?? "1");
  const pageSize = Number(pageSizeValue ?? String(maxPageSize));
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > maxPageSize) {
    throw new ResourceLimitError("INVALID_BOUND");
  }
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throw new ResourceLimitError("INVALID_BOUND");
  return { page, pageSize, offset };
}

export function assertBoundedDateWindow(start: Date, end: Date, maxDays: number): void {
  const duration = end.getTime() - start.getTime();
  if (!Number.isInteger(maxDays) || maxDays < 1 || !Number.isFinite(duration) || duration < 0 || duration > maxDays * 86_400_000) {
    throw new ResourceLimitError("INVALID_BOUND");
  }
}

export async function runWithBoundedRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: { attempts: number; baseDelayMs: number; isRetryable: (error: unknown) => boolean; random?: () => number },
): Promise<T> {
  if (!Number.isInteger(options.attempts) || options.attempts < 1 || options.attempts > 5 || options.baseDelayMs < 0 || options.baseDelayMs > 1_000) {
    throw new ResourceLimitError("INVALID_BOUND");
  }
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt === options.attempts || !options.isRetryable(error)) throw error;
      const jitter = Math.floor((options.random ?? Math.random)() * options.baseDelayMs);
      await new Promise((resolve) => setTimeout(resolve, options.baseDelayMs * attempt + jitter));
    }
  }
  throw new ResourceLimitError("RETRY_EXHAUSTED");
}

const inFlight = new Map<RouteClass, number>();

export async function runWithRouteConcurrency<T>(routeClass: RouteClass, operation: () => Promise<T>, maximum: number): Promise<T> {
  if (!Number.isInteger(maximum) || maximum < 1) throw new ResourceLimitError("INVALID_BOUND");
  const current = inFlight.get(routeClass) ?? 0;
  if (current >= maximum) throw new ResourceLimitError("OVERLOADED");
  inFlight.set(routeClass, current + 1);
  try {
    return await operation();
  } finally {
    const remaining = (inFlight.get(routeClass) ?? 1) - 1;
    if (remaining === 0) inFlight.delete(routeClass);
    else inFlight.set(routeClass, remaining);
  }
}

export async function applyTransactionResourceLimits(client: { query: (text: string) => Promise<unknown> }): Promise<void> {
  await client.query("set local statement_timeout = '5s'");
  await client.query("set local lock_timeout = '1s'");
  await client.query("set local transaction_timeout = '15s'");
}
