import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiKeyQuotas } from "@/db/controls-schema";
import { apiKeys, gatewayQuotaReservations, usageCounters } from "@/db/schema";

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
  unpricedUnknownCharge: boolean;
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
  const reservations = await db.select({ tokens: gatewayQuotaReservations.reservedTokens, cost: gatewayQuotaReservations.reservedCostUsd, status: gatewayQuotaReservations.status })
    .from(gatewayQuotaReservations)
    .where(and(
      eq(gatewayQuotaReservations.organizationId, organizationId),
      eq(gatewayQuotaReservations.apiKeyId, apiKeyId),
      eq(gatewayQuotaReservations.periodStart, start),
      inArray(gatewayQuotaReservations.status, ["reserved", "unknown"]),
    ));
  const values = new Map(counters.map((row) => [row.metric, asNumber(row.value)]));
  const reservedTokens = reservations.reduce((sum, row) => sum + asNumber(row.tokens), 0);
  const reservedCostUsd = reservations.reduce((sum, row) => sum + asNumber(row.cost), 0);
  return {
    enabled: quota?.enabled ?? true,
    requestsPerMinute: quota?.requestsPerMinute ?? 120,
    monthlyTokenLimit: quota?.monthlyTokenLimit ?? null,
    monthlyCostLimitUsd: quota?.monthlyCostLimitUsd === null || quota?.monthlyCostLimitUsd === undefined ? null : Number(quota.monthlyCostLimitUsd),
    usedTokens: (values.get("gateway_tokens") ?? 0) + reservedTokens,
    usedCostUsd: (values.get("gateway_cost_usd") ?? 0) + reservedCostUsd,
    unpricedUnknownCharge: reservations.some((row) => row.status === "unknown" && row.cost === null),
    resetAt: end,
  };
}

export async function reserveApiKeyGatewayQuota(args: {
  organizationId: string;
  apiKeyId: string;
  runId: string;
  tokens: number;
  costUsd: number | null;
}) {
  if (!Number.isFinite(args.tokens) || args.tokens <= 0 || (args.costUsd !== null && (!Number.isFinite(args.costUsd) || args.costUsd < 0))) {
    throw new Error("GATEWAY_QUOTA_RESERVATION_INVALID");
  }
  const { start, end } = monthWindow();
  const db = getDb();
  return db.transaction(async (tx) => {
    const key = (await tx.select({ id: apiKeys.id }).from(apiKeys).where(and(
      eq(apiKeys.id, args.apiKeyId),
      eq(apiKeys.organizationId, args.organizationId),
    )).for("update").limit(1))[0];
    if (!key) throw new Error("API_KEY_NOT_FOUND");

    const existing = (await tx.select({ id: gatewayQuotaReservations.id }).from(gatewayQuotaReservations).where(and(
      eq(gatewayQuotaReservations.id, args.runId),
      eq(gatewayQuotaReservations.organizationId, args.organizationId),
      eq(gatewayQuotaReservations.apiKeyId, args.apiKeyId),
    )).limit(1))[0];
    if (existing) throw new Error("GATEWAY_QUOTA_RESERVATION_EXISTS");

    const quota = (await tx.select().from(apiKeyQuotas).where(and(
      eq(apiKeyQuotas.organizationId, args.organizationId),
      eq(apiKeyQuotas.apiKeyId, args.apiKeyId),
    )).limit(1))[0];
    if (quota?.enabled === false) throw new Error("API_KEY_QUOTA_DISABLED");

    const counters = await tx.select({ metric: usageCounters.metric, value: usageCounters.value }).from(usageCounters).where(and(
      eq(usageCounters.organizationId, args.organizationId),
      eq(usageCounters.scopeType, "api_key"),
      eq(usageCounters.scopeId, args.apiKeyId),
      eq(usageCounters.periodStart, start),
    ));
    const counterValues = new Map(counters.map((row) => [row.metric, asNumber(row.value)]));
    const reservations = await tx.select({ tokens: gatewayQuotaReservations.reservedTokens, cost: gatewayQuotaReservations.reservedCostUsd, status: gatewayQuotaReservations.status })
      .from(gatewayQuotaReservations)
      .where(and(
        eq(gatewayQuotaReservations.organizationId, args.organizationId),
        eq(gatewayQuotaReservations.apiKeyId, args.apiKeyId),
        eq(gatewayQuotaReservations.periodStart, start),
        inArray(gatewayQuotaReservations.status, ["reserved", "unknown"]),
      ));
    const heldTokens = reservations.reduce((sum, row) => sum + asNumber(row.tokens), 0);
    const heldCost = reservations.reduce((sum, row) => sum + asNumber(row.cost), 0);
    const usedTokens = (counterValues.get("gateway_tokens") ?? 0) + heldTokens;
    const usedCost = (counterValues.get("gateway_cost_usd") ?? 0) + heldCost;
    if (quota?.monthlyTokenLimit !== null && quota?.monthlyTokenLimit !== undefined && usedTokens + args.tokens > quota.monthlyTokenLimit) {
      throw new Error("MONTHLY_TOKEN_QUOTA_EXCEEDED");
    }
    if (quota?.monthlyCostLimitUsd !== null && quota?.monthlyCostLimitUsd !== undefined) {
      if (reservations.some((row) => row.status === "unknown" && row.cost === null)) throw new Error("MONTHLY_COST_QUOTE_UNAVAILABLE");
      if (args.costUsd === null) throw new Error("MONTHLY_COST_QUOTE_UNAVAILABLE");
      if (usedCost + args.costUsd > Number(quota.monthlyCostLimitUsd)) throw new Error("MONTHLY_COST_QUOTA_EXCEEDED");
    }

    await tx.insert(gatewayQuotaReservations).values({
      id: args.runId,
      organizationId: args.organizationId,
      apiKeyId: args.apiKeyId,
      periodStart: start,
      periodEnd: end,
      reservedTokens: args.tokens.toString(),
      reservedCostUsd: args.costUsd?.toString() ?? null,
      status: "reserved",
    });
  });
}

export async function settleApiKeyGatewayQuota(args: {
  organizationId: string;
  apiKeyId: string;
  runId: string;
  outcome: "released" | "unknown";
}) {
  await getDb().update(gatewayQuotaReservations).set({ status: args.outcome, updatedAt: new Date() }).where(and(
    eq(gatewayQuotaReservations.id, args.runId),
    eq(gatewayQuotaReservations.organizationId, args.organizationId),
    eq(gatewayQuotaReservations.apiKeyId, args.apiKeyId),
    eq(gatewayQuotaReservations.status, "reserved"),
  ));
}

export async function checkApiKeyQuota(organizationId: string, apiKeyId: string) {
  const state = await getApiKeyQuotaState(organizationId, apiKeyId);
  if (!state.enabled) return { allowed: false as const, reason: "API_KEY_QUOTA_DISABLED", state };
  if (state.monthlyTokenLimit !== null && state.usedTokens >= state.monthlyTokenLimit) return { allowed: false as const, reason: "MONTHLY_TOKEN_QUOTA_EXCEEDED", state };
  if (state.monthlyCostLimitUsd !== null && state.unpricedUnknownCharge) return { allowed: false as const, reason: "MONTHLY_COST_QUOTE_UNAVAILABLE", state };
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
