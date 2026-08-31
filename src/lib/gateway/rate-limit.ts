import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

function minuteWindow(now = new Date()) {
  const start = new Date(now);
  start.setUTCSeconds(0, 0);
  const end = new Date(start.getTime() + 60_000);
  return { start, end };
}

/**
 * Distributed fixed-window limiter backed by PostgreSQL.
 * This deliberately avoids process memory so horizontally scaled Vercel instances
 * share one enforcement authority. Economic state remains in Postgres and Redis is
 * not required for the initial production architecture.
 */
export async function consumeGatewayRateLimit(organizationId: string, apiKeyId: string, limit = 120): Promise<RateLimitResult> {
  const { start, end } = minuteWindow();
  const id = `rl:${organizationId}:${apiKeyId}:${start.toISOString()}`;
  const result = await getDb().execute(sql`
    INSERT INTO usage_counters (id, organization_id, scope_type, scope_id, metric, period_start, period_end, value, created_at, updated_at)
    VALUES (${id}, ${organizationId}, 'api_key', ${apiKeyId}, 'gateway_requests', ${start}, ${end}, 1, now(), now())
    ON CONFLICT (organization_id, scope_type, scope_id, metric, period_start)
    DO UPDATE SET value = usage_counters.value + 1, updated_at = now()
    WHERE usage_counters.value < ${limit}
    RETURNING value
  `);
  const row = Array.from(result as unknown as Iterable<Record<string, unknown>>)[0];
  const value = row ? Number(row.value) : limit;
  return { allowed: Boolean(row), limit, remaining: Math.max(limit - value, 0), resetAt: end };
}
