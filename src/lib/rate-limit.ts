// Best-effort in-memory limiter. On serverless hosting each instance keeps its
// own counters, so this caps casual abuse of the free LLM quota but is not a
// hard guarantee. A shared store (e.g. Upstash Redis) would be the next step.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_TRACKED_CLIENTS = 5_000;

const hits = new Map<string, number[]>();

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function isRateLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_TRACKED_CLIENTS) {
    for (const [client, times] of hits) {
      if (!times.some((time) => now - time < WINDOW_MS)) hits.delete(client);
    }
  }
  return false;
}

export function resetRateLimits() {
  hits.clear();
}
