import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { getConfigurationStatus } from "@/lib/config";
import { platformCostProviderStates } from "@/lib/admin/cost-providers";

const money = (value: string | number | null | undefined) => value === null || value === undefined ? null : Number(value);
const startOfDay = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const daysAgo = (days: number) => new Date(startOfDay().getTime() - days * 86_400_000);
const successful = (status: string, outcome: string | null) => ["success", "completed", "passed", "merged", "verified"].includes((outcome ?? status).toLowerCase());
const failed = (status: string) => ["failed", "aborted", "cancelled", "budget_blocked"].includes(status.toLowerCase());

export async function getAdminOverviewData() {
  const db = getDb();
  const since30 = daysAgo(30);
  const [userTotal, orgTotal, orgPlanRows, subscriptionRows, runRows, callRows, costRows, latestAudit] = await Promise.all([
    db.select({ value: count() }).from(schema.users),
    db.select({ value: count() }).from(schema.organizations),
    db.select({ plan: schema.organizations.plan, value: count() }).from(schema.organizations).groupBy(schema.organizations.plan),
    db.select().from(schema.subscriptions).limit(1000),
    db.select().from(schema.runs).where(gte(schema.runs.startedAt, since30)).orderBy(desc(schema.runs.startedAt)).limit(10_000),
    db.select().from(schema.llmCalls).where(gte(schema.llmCalls.startedAt, since30)).limit(20_000),
    db.select().from(schema.platformCostEntries).where(gte(schema.platformCostEntries.incurredAt, since30)).limit(10_000),
    db.select().from(schema.platformAdminAuditEvents).orderBy(desc(schema.platformAdminAuditEvents.occurredAt)).limit(12),
  ]);
  const registrations = async (start: Date, end?: Date) => (await db.select({ value: count() }).from(schema.users).where(end ? and(gte(schema.users.createdAt, start), lt(schema.users.createdAt, end)) : gte(schema.users.createdAt, start)))[0]?.value ?? 0;
  const today = startOfDay(); const yesterday = daysAgo(1);
  const [todayRegistrations, yesterdayRegistrations, registrations7, registrations30] = await Promise.all([registrations(today), registrations(yesterday, today), registrations(daysAgo(7)), registrations(since30)]);
  const knownAiCosts = callRows.flatMap((row) => money(row.costUsd) === null ? [] : [money(row.costUsd)!]);
  const knownPlatformCosts = costRows.reduce((sum, row) => sum + (money(row.amountUsd) ?? 0), 0);
  const measuredRevenue = subscriptionRows.filter((row) => ["active", "trialing", "past_due"].includes(row.status)).length ? null : null;
  const statuses = getConfigurationStatus();
  return {
    users: { total: userTotal[0]?.value ?? 0, today: todayRegistrations, yesterday: yesterdayRegistrations, sevenDays: registrations7, thirtyDays: registrations30 },
    organizations: {
      total: orgTotal[0]?.value ?? 0,
      byPlan: Object.fromEntries([
        ...["free", "pro", "team", "enterprise"].map((plan) => [plan, 0]),
        ...orgPlanRows.map((row) => [row.plan, Number(row.value)]),
      ]),
    },
    subscriptions: { total: subscriptionRows.length, active: subscriptionRows.filter((row) => row.status === "active").length, trialing: subscriptionRows.filter((row) => row.status === "trialing").length, pastDue: subscriptionRows.filter((row) => row.status === "past_due").length, canceled: subscriptionRows.filter((row) => row.status === "canceled").length, evidence: process.env.STRIPE_SECRET_KEY ? "stripe_synced" : "not_configured" },
    usage: { runs: runRows.length, successfulRuns: runRows.filter((row) => successful(row.status, row.outcomeStatus)).length, failedRuns: runRows.filter((row) => failed(row.status)).length, tokens: runRows.reduce((sum, row) => sum + row.freshInputTokens + row.cacheReadTokens + row.cacheWriteTokens + row.reasoningTokens + row.outputTokens, 0), toolCalls: runRows.reduce((sum, row) => sum + row.toolCallCount, 0), knownAiCostUsd: knownAiCosts.reduce((sum, value) => sum + value, 0), unknownAiCostCount: callRows.filter((row) => money(row.costUsd) === null).length },
    economics: { revenueUsd: measuredRevenue, knownPlatformCostUsd: knownPlatformCosts, grossMarginUsd: measuredRevenue === null ? null : measuredRevenue - knownPlatformCosts, costCoverage: costRows.length ? "partial_cost_coverage" : "unavailable" },
    health: statuses,
    audit: latestAudit.map((row) => ({ action: row.action, entityType: row.entityType, occurredAt: row.occurredAt, reason: row.reason })),
  };
}

export async function getAdminSectionData(section: string, pagination: { limit?: number; offset?: number } = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(pagination.limit ?? 100, 1), 200);
  const offset = Math.max(pagination.offset ?? 0, 0);
  const overview = await getAdminOverviewData();
  if (section === "users") return { overview, rows: await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, createdAt: schema.users.createdAt }).from(schema.users).orderBy(desc(schema.users.createdAt)).limit(limit).offset(offset) };
  if (section === "organizations") return { overview, rows: await db.select({ id: schema.organizations.id, name: schema.organizations.name, plan: schema.organizations.plan, createdAt: schema.organizations.createdAt }).from(schema.organizations).orderBy(desc(schema.organizations.createdAt)).limit(limit).offset(offset) };
  if (section === "subscriptions") return { overview, rows: await db.select().from(schema.subscriptions).orderBy(desc(schema.subscriptions.createdAt)).limit(limit).offset(offset) };
  if (section === "platform-costs" || section === "finops") return { overview, rows: await db.select().from(schema.platformCostEntries).orderBy(desc(schema.platformCostEntries.incurredAt)).limit(limit).offset(offset) };
  if (section === "providers") return { overview, rows: await db.select({ provider: schema.llmCalls.provider, model: schema.llmCalls.modelResolved, costUsd: schema.llmCalls.costUsd, costSource: schema.llmCalls.costSource, startedAt: schema.llmCalls.startedAt }).from(schema.llmCalls).orderBy(desc(schema.llmCalls.startedAt)).limit(limit).offset(offset) };
  if (section === "audit") return { overview, rows: await db.select().from(schema.platformAdminAuditEvents).orderBy(desc(schema.platformAdminAuditEvents.occurredAt)).limit(limit).offset(offset) };
  if (section === "usage") return { overview, rows: await db.select({ id: schema.runs.id, organizationId: schema.runs.organizationId, status: schema.runs.status, agentName: schema.runs.agentName, startedAt: schema.runs.startedAt, cost: schema.runs.reconciledCostUsd }).from(schema.runs).orderBy(desc(schema.runs.startedAt)).limit(limit).offset(offset) };
  if (section === "system") return { overview, rows: Object.entries(getConfigurationStatus()).map(([service, status]) => ({ service, status, evidence: status === "live" ? "runtime_configured" : status === "not_enabled" ? "optional_disabled" : "configuration_blocked" })) };
  if (section === "integrations") return { overview, rows: platformCostProviderStates().map((provider) => ({ ...provider, runtimeStatus: provider.provider === "stripe" ? getConfigurationStatus().stripe : provider.provider === "github" ? getConfigurationStatus().github : provider.provider === "workos" ? getConfigurationStatus().auth : provider.provider === "otel" ? getConfigurationStatus().otel : "not_configured" })) };
  if (section === "release") return { overview, rows: releaseReadiness(overview) };
  return { overview, rows: [] as Record<string, unknown>[] };
}

function releaseReadiness(overview: Awaited<ReturnType<typeof getAdminOverviewData>>) {
  const candidateSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null;
  const items = [
    ["candidate_sha", candidateSha ? "present" : "unavailable", candidateSha ?? "Set by certified CI or deployment metadata"],
    ["database", overview.health.database === "live" ? "configured" : "blocked", overview.health.database],
    ["authentication", overview.health.auth === "live" ? "configured" : "blocked", overview.health.auth],
    ["billing_test_mode", overview.health.stripe === "live" ? "configured" : "blocked", overview.health.stripe],
    ["credential_vault", overview.health.credentialVault === "live" ? "configured" : "blocked", overview.health.credentialVault],
    ["github_integration", overview.health.github === "live" ? "configured" : "blocked", overview.health.github],
    ["browser_matrix", process.env.CI === "true" ? "running_or_recorded" : "unavailable", "Recorded by GitHub Actions; never inferred locally"],
  ];
  return items.map(([gate, state, evidence]) => ({ gate, state, evidence }));
}

export async function rollupPlatformDay(requestedDay = startOfDay()) {
  const day = startOfDay(requestedDay);
  const db = getDb(); const end = new Date(day.getTime() + 86_400_000);
  const [registration, organization, rows, subscriptions, costs] = await Promise.all([
    db.select({ value: count() }).from(schema.users).where(and(gte(schema.users.createdAt, day), lt(schema.users.createdAt, end))),
    db.select({ value: count() }).from(schema.organizations).where(and(gte(schema.organizations.createdAt, day), lt(schema.organizations.createdAt, end))),
    db.select().from(schema.runs).where(and(gte(schema.runs.startedAt, day), lt(schema.runs.startedAt, end))).limit(100_000),
    db.select({ value: count() }).from(schema.subscriptions).where(and(eq(schema.subscriptions.status, "active"), gte(schema.subscriptions.createdAt, day), lt(schema.subscriptions.createdAt, end))),
    db.select().from(schema.platformCostEntries).where(and(gte(schema.platformCostEntries.incurredAt, day), lt(schema.platformCostEntries.incurredAt, end))).limit(10_000),
  ]);
  const known = rows.flatMap((row) => money(row.reconciledCostUsd) ?? money(row.actualCostUsd) ?? money(row.estimatedCostUsd) ?? []);
  const value = { day, registrations: registration[0]?.value ?? 0, organizations: organization[0]?.value ?? 0, activeUsers: new Set(rows.map((row) => row.developerUserId).filter(Boolean)).size, runs: rows.length, successfulRuns: rows.filter((row) => successful(row.status, row.outcomeStatus)).length, failedRuns: rows.filter((row) => failed(row.status)).length, inputTokens: rows.reduce((sum, row) => sum + row.freshInputTokens + row.cacheReadTokens + row.cacheWriteTokens + row.reasoningTokens, 0), outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0), knownAiCostUsd: known.length ? known.reduce((sum, amount) => sum + amount, 0).toFixed(8) : null, unknownCostCount: rows.length - known.length, payingSubscriptions: subscriptions[0]?.value ?? 0, knownPlatformCostUsd: costs.length ? costs.reduce((sum, row) => sum + (money(row.amountUsd) ?? 0), 0).toFixed(8) : null, computedAt: new Date() };
  await db.insert(schema.platformDailyMetrics).values(value).onConflictDoUpdate({ target: schema.platformDailyMetrics.day, set: value });
  return value;
}
