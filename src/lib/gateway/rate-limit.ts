import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Distributed fixed-window limiter backed by PostgreSQL.
 * PostgreSQL defines the minute boundary so horizontally scaled Vercel instances
 * share one enforcement clock and one atomic counter. Economic state remains in
 * Postgres and Redis is not required for the initial production architecture.
 */
export async function consumeGatewayRateLimit(organizationId: string, apiKeyId: string, limit = 120): Promise<RateLimitResult> {
  const id = `rl:${organizationId}:${apiKeyId}:${randomUUID()}`;
  const result = await getDb().execute(sql`
    WITH rate_window AS (
      SELECT date_trunc('minute', now()) AS start_at
    )
    INSERT INTO usage_counters (
      id,
      organization_id,
      scope_type,
      scope_id,
      metric,
      period_start,
      period_end,
      value,
      created_at,
      updated_at
    )
    SELECT
      ${id},
      ${organizationId},
      'api_key',
      ${apiKeyId},
      'gateway_requests',
      start_at,
      start_at + interval '1 minute',
      1,
      now(),
      now()
    FROM rate_window
    ON CONFLICT (organization_id, scope_type, scope_id, metric, period_start)
    DO UPDATE SET value = usage_counters.value + 1, updated_at = now()
    WHERE usage_counters.value < ${limit}
    RETURNING value, period_end
  `);

  const row = Array.from(result as unknown as Iterable<Record<string, unknown>>)[0];
  const value = row ? Number(row.value) : limit;
  const resetValue = row?.period_end;
  const resetAt = resetValue instanceof Date
    ? resetValue
    : resetValue
      ? new Date(String(resetValue))
      : new Date(Date.now() + 60_000);

  return {
    allowed: Boolean(row),
    limit,
    remaining: Math.max(limit - value, 0),
    resetAt,
  };
}
