import { createHash } from "node:crypto";

type Bucket = { windowStart: number; count: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

function clientKey(request: Request, namespace: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(namespace + ":" + source).digest("hex");
}

function prune(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
}

export interface PublicRateLimitResult {
  allowed: boolean;
  headers: Record<string, string>;
}

export function consumePublicRateLimit(request: Request, namespace: string, limit = 120, now = Date.now()): PublicRateLimitResult {
  prune(now);
  const key = clientKey(request, namespace);
  const current = buckets.get(key);
  const bucket = !current || now - current.windowStart >= WINDOW_MS
    ? { windowStart: now, count: 0 }
    : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  const resetAt = bucket.windowStart + WINDOW_MS;
  const allowed = bucket.count <= limit;
  const remaining = Math.max(limit - bucket.count, 0);
  return {
    allowed,
    headers: {
      "RateLimit-Limit": String(limit),
      "RateLimit-Remaining": String(remaining),
      "RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      ...(allowed ? {} : { "Retry-After": String(Math.max(1, Math.ceil((resetAt - now) / 1000))) }),
    },
  };
}
