import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { budgetDecisions, budgets, policies } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { evaluatePolicies, type EvaluatedPolicy, type PolicyRuleSet } from "@/lib/policy/engine";
import { policyCheckSchema } from "@/lib/policy/schemas";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function applies(scopeType: string, scopeId: string | null, check: ReturnType<typeof policyCheckSchema.parse>): boolean {
  if (scopeType === "organization") return true;
  const map: Record<string, string | null | undefined> = {
    project: check.projectId,
    environment: check.environment,
    user: check.userId,
    service_account: check.serviceAccountId,
    api_key: check.apiKeyId,
    agent: check.agent,
    workflow: check.workflow,
    run: check.runId,
  };
  return Boolean(scopeId && map[scopeType] === scopeId);
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "read:budgets");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  const parsed = policyCheckSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  const check = parsed.data;
  if (principal.kind === "api_key" && principal.projectId && check.projectId && principal.projectId !== check.projectId) return reply({ error: "PROJECT_SCOPE_VIOLATION" }, 403);

  const db = getDb();
  const [policyRows, budgetRows] = await Promise.all([
    db.select().from(policies).where(and(eq(policies.organizationId, principal.organizationId), eq(policies.enabled, true))),
    db.select().from(budgets).where(and(eq(budgets.organizationId, principal.organizationId), eq(budgets.enabled, true))),
  ]);

  const applicable: EvaluatedPolicy[] = policyRows
    .filter((policy) => applies(policy.scopeType, policy.scopeId, check))
    .map((policy) => ({ id: policy.id, name: policy.name, priority: policy.priority, scopeType: policy.scopeType, scopeId: policy.scopeId, rules: policy.rules as PolicyRuleSet }));

  for (const budget of budgetRows.filter((row) => applies(row.scopeType, row.scopeId, check))) {
    const maxCostUsd = budget.limitUsd === null ? undefined : Number(budget.limitUsd);
    const warnCostUsd = maxCostUsd === undefined ? undefined : maxCostUsd * (Number(budget.warnAtPct) / 100);
    applicable.push({
      id: budget.id,
      name: budget.name,
      priority: budget.hardStop ? 1 : 90,
      scopeType: budget.scopeType,
      scopeId: budget.scopeId,
      rules: {
        maxCostUsd: budget.hardStop ? maxCostUsd : undefined,
        warnCostUsd,
        maxTokens: budget.hardStop ? budget.tokenLimit ?? undefined : undefined,
      },
    });
  }

  const decision = evaluatePolicies(applicable, {
    observedCostUsd: check.observedCostUsd,
    projectedNextCallCostUsd: check.projectedNextCallCostUsd,
    tokens: check.tokens,
    turns: check.turns,
    retries: check.retries,
    failedToolCalls: check.failedToolCalls,
    toolCalls: check.toolCalls,
    contextUtilizationPct: check.contextUtilizationPct,
    provider: check.provider,
    model: check.model,
    fallbackPremiumUsd: check.fallbackPremiumUsd,
    isFallback: check.isFallback,
  });

  if (check.runId) {
    await db.insert(budgetDecisions).values({
      id: `dec_${randomUUID()}`,
      organizationId: principal.organizationId,
      runId: check.runId,
      policyId: decision.policyIds.length === 1 ? decision.policyIds[0] : null,
      action: decision.action,
      reason: decision.reason,
      projectedCostUsd: check.projectedNextCallCostUsd?.toString() ?? null,
      observedCostUsd: check.observedCostUsd.toString(),
      decisionData: { policyIds: decision.policyIds, constraints: decision.constraints },
    });
  }

  return reply({ data: decision, enforcement: decision.action === "ALLOW" || decision.action === "WARN" || decision.action === "NOTIFY" ? "continue" : decision.action === "REQUIRE_APPROVAL" ? "await_approval" : "blocked" });
}
