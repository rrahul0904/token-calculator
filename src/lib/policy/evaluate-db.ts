import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { approvals, budgetDecisions, budgets, policies } from "@/db/schema";
import { getDb } from "@/db/client";
import { composeRestrictiveRules, evaluatePolicies, type EvaluatedPolicy, type PolicyRuleSet } from "@/lib/policy/engine";
import { policyCheckSchema } from "@/lib/policy/schemas";

export type PolicyCheck = ReturnType<typeof policyCheckSchema.parse>;

function applies(scopeType: string, scopeId: string | null, check: PolicyCheck): boolean {
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

export async function evaluateOrganizationPolicy(organizationId: string, checkInput: unknown, persistDecision = true) {
  const check = policyCheckSchema.parse(checkInput);
  const db = getDb();
  const [policyRows, budgetRows] = await Promise.all([
    db.select().from(policies).where(and(eq(policies.organizationId, organizationId), eq(policies.enabled, true))),
    db.select().from(budgets).where(and(eq(budgets.organizationId, organizationId), eq(budgets.enabled, true))),
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

  const effectiveRules = composeRestrictiveRules(applicable);
  const decision = evaluatePolicies(applicable, {
    observedCostUsd: check.observedCostUsd,
    projectedNextCallCostUsd: check.projectedNextCallCostUsd,
    tokens: check.tokens,
    turns: check.turns,
    retries: check.retries,
    failedToolCalls: check.failedToolCalls,
    toolCalls: check.toolCalls,
    elapsedMs: check.elapsedMs,
    providerRounds: check.providerRounds,
    resultBytes: check.resultBytes,
    contextUtilizationPct: check.contextUtilizationPct,
    provider: check.provider,
    model: check.model,
    fallbackPremiumUsd: check.fallbackPremiumUsd,
    isFallback: check.isFallback,
    actionRisk: check.actionRisk,
    actionCategory: check.actionCategory,
    actionName: check.actionName,
  });

  let approvalId: string | null = null;
  if (persistDecision && check.runId) {
    await db.transaction(async (tx) => {
      await tx.insert(budgetDecisions).values({
        id: `dec_${randomUUID()}`,
        organizationId,
        runId: check.runId,
        policyId: decision.policyIds.length === 1 ? decision.policyIds[0] : null,
        action: decision.action,
        reason: decision.reason,
        projectedCostUsd: check.projectedNextCallCostUsd?.toString() ?? null,
        observedCostUsd: check.observedCostUsd.toString(),
        decisionData: {
          policyIds: decision.policyIds,
          constraints: decision.constraints,
          actionRisk: check.actionRisk ?? null,
          actionCategory: check.actionCategory ?? null,
          actionName: check.actionName ?? null,
        },
      });

      if (decision.action === "REQUIRE_APPROVAL") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${check.runId!}))`);
        const pending = await tx.select().from(approvals).where(and(
          eq(approvals.organizationId, organizationId),
          eq(approvals.runId, check.runId!),
          eq(approvals.status, "pending"),
        ));
        const now = new Date();
        const active = pending.find((row) => !row.expiresAt || row.expiresAt.getTime() > now.getTime());
        const expired = pending.filter((row) => row.expiresAt && row.expiresAt.getTime() <= now.getTime());
        for (const row of expired) {
          await tx.update(approvals).set({ status: "expired", updatedAt: now }).where(eq(approvals.id, row.id));
        }
        if (active) {
          approvalId = active.id;
        } else {
          approvalId = `apr_${randomUUID()}`;
          await tx.insert(approvals).values({
            id: approvalId,
            organizationId,
            runId: check.runId!,
            policyId: decision.policyIds.length === 1 ? decision.policyIds[0] : null,
            status: "pending",
            requestedBy: "policy_engine",
            reason: decision.reason,
            expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
          });
        }
      }
    });
  }

  return {
    decision,
    approvalId,
    effectiveRules,
    enforcement: decision.action === "ALLOW" || decision.action === "WARN" || decision.action === "NOTIFY"
      ? "continue"
      : decision.action === "REQUIRE_APPROVAL"
        ? "await_approval"
        : "blocked",
  } as const;
}
