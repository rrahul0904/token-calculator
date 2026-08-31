import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiKeyQuotas } from "@/db/controls-schema";
import { usageCounters } from "@/db/schema";

function monthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface ApiKeyQuotaState {
  enabled: boolean;
  requestsPerMinute: number;
  monthlyTokenLimit: number | null;
  monthlyCostLimitUsd: number | null;
  usedTokens: number;
  usedCostUsd: number;
  resetAt: Date;
}

export async function getApiKeyQuotaState(organizationId: string, apiKeyId: string): Promise<ApiKeyQuotaState> {
  const db = getDb();
  const quota = (await db.select().from(apiKeyQuotas).where(and(eq(apiKeyQuotas.organizationId, organizationId), eq(apiKeyQuotas.apiKeyId, apiKeyId))).limit(1))[0];
  const { start, end } = monthWindow();
  const counters = await db.select({ metric: usageCounters.metric, value: usageCounters.value }).from(usageCounters).where(and(
    eq(usageCounters.organizationId, organizationId),
    eq(usageCounters.scopeType, "api_key"),
    eq(usageCounters.scopeId, apiKeyId),
    eq(usageCounters.periodStart, start),
  ));
  const values = new Map(counters.map((row) => [row.metric, asNumber(row.value)]));
  return {
    enabled: quota?.enabled ?? true,
    requestsPerMinute: quota?.requestsPerMinute ?? 120,
    monthlyTokenLimit: quota?.monthlyTokenLimit ?? null,
    monthlyCostLimitUsd: quota?.monthlyCostLimitUsd === null || quota?.monthlyCostLimitUsd === undefined ? null : Number(quota.monthlyCostLimitUsd),
    usedTokens: values.get("gateway_tokens") ?? 0,
    usedCostUsd: values.get("gateway_cost_usd") ?? 0,
    resetAt: end,
  };
}

export async function checkApiKeyQuota(organizationId: string, apiKeyId: string) {
  const state = await getApiKeyQuotaState(organizationId, apiKeyId);
  if (!state.enabled) return { allowed: false as const, reason: "API_KEY_QUOTA_DISABLED", state };
  if (state.monthlyTokenLimit !== null && state.usedTokens >= state.monthlyTokenLimit) return { allowed: false as const, reason: "MONTHLY_TOKEN_QUOTA_EXCEEDED", state };
  if (state.monthlyCostLimitUsd !== null && state.usedCostUsd >= state.monthlyCostLimitUsd) return { allowed: false as const, reason: "MONTHLY_COST_QUOTA_EXCEEDED", state };
  return { allowed: true as const, reason: null, state };
}

async function incrementCounter(organizationId: string, apiKeyId: string, metric: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) return;
  const { start, end } = monthWindow();
  const id = `quota:${organizationId}:${apiKeyId}:${metric}:${start.toISOString()}`;
  const db = getDb();
  const existing = (await db.select().from(usageCounters).where(and(
    eq(usageCounters.organizationId, organizationId),
    eq(usageCounters.scopeType, "api_key"),
    eq(usageCounters.scopeId, apiKeyId),
    eq(usageCounters.metric, metric),
    eq(usageCounters.periodStart, start),
  )).limit(1))[0];
  if (existing) {
    await db.update(usageCounters).set({ value: (asNumber(existing.value) + value).toString(), updatedAt: new Date() }).where(eq(usageCounters.id, existing.id));
    return;
  }
  await db.insert(usageCounters).values({
    id,
    organizationId,
    scopeType: "api_key",
    scopeId: apiKeyId,
    metric,
    periodStart: start,
    periodEnd: end,
    value: value.toString(),
  }).onConflictDoNothing();
}

export async function recordApiKeyGatewayUsage(organizationId: string, apiKeyId: string, usage: { tokens: number | null; costUsd: number | null }) {
  await Promise.all([
    usage.tokens === null ? Promise.resolve() : incrementCounter(organizationId, apiKeyId, "gateway_tokens", usage.tokens),
    usage.costUsd === null ? Promise.resolve() : incrementCounter(organizationId, apiKeyId, "gateway_cost_usd", usage.costUsd),
  ]);
}
