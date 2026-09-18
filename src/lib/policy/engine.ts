export type PolicyAction = "ALLOW" | "WARN" | "NOTIFY" | "REQUIRE_APPROVAL" | "DISABLE_FALLBACK" | "BLOCK_NEXT_CALL" | "KILL_RUN";
export type ActionRisk = "low" | "medium" | "high" | "critical";

export interface PolicyRuleSet {
  maxCostUsd?: number;
  warnCostUsd?: number;
  maxTokens?: number;
  maxTurns?: number;
  maxRetries?: number;
  maxFailedToolCalls?: number;
  maxToolCalls?: number;
  maxElapsedMs?: number;
  maxProviderRounds?: number;
  maxResultBytes?: number;
  maxContextUtilizationPct?: number;
  allowedProviders?: string[];
  allowedModels?: string[];
  fallbackPremiumApprovalUsd?: number;
  disableFallback?: boolean;
  maxAutonomousActionRisk?: ActionRisk;
  approvalActionCategories?: string[];
  blockedActionCategories?: string[];
}

export interface EvaluatedPolicy {
  id: string;
  name: string;
  priority: number;
  scopeType: string;
  scopeId?: string | null;
  rules: PolicyRuleSet;
}

export interface PolicyRuntimeState {
  observedCostUsd: number;
  projectedNextCallCostUsd?: number;
  tokens: number;
  turns: number;
  retries: number;
  failedToolCalls: number;
  toolCalls: number;
  elapsedMs: number;
  providerRounds: number;
  resultBytes: number;
  contextUtilizationPct?: number;
  provider?: string;
  model?: string;
  fallbackPremiumUsd?: number;
  isFallback?: boolean;
  actionRisk?: ActionRisk;
  actionCategory?: string;
  actionName?: string;
}

export interface PolicyDecision {
  action: PolicyAction;
  reason: string;
  policyIds: string[];
  constraints: string[];
}

const RISK_RANK: Record<ActionRisk, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const ACTION_RANK: Record<PolicyAction, number> = {
  ALLOW: 0,
  NOTIFY: 1,
  WARN: 2,
  DISABLE_FALLBACK: 3,
  REQUIRE_APPROVAL: 4,
  BLOCK_NEXT_CALL: 5,
  KILL_RUN: 6,
};

function strongest(decisions: PolicyDecision[]): PolicyDecision {
  if (decisions.length === 0) return { action: "ALLOW", reason: "No active policy blocked this operation.", policyIds: [], constraints: [] };
  const highest = Math.max(...decisions.map((decision) => ACTION_RANK[decision.action]));
  const selected = decisions.filter((decision) => ACTION_RANK[decision.action] === highest);
  return {
    action: selected[0].action,
    reason: selected.map((decision) => decision.reason).join(" "),
    policyIds: Array.from(new Set(selected.flatMap((decision) => decision.policyIds))),
    constraints: Array.from(new Set(decisions.flatMap((decision) => decision.constraints))),
  };
}

function decision(action: PolicyAction, policy: EvaluatedPolicy, reason: string, constraint: string): PolicyDecision {
  return { action, reason, policyIds: [policy.id], constraints: [constraint] };
}

export function evaluatePolicies(policies: EvaluatedPolicy[], state: PolicyRuntimeState): PolicyDecision {
  const ordered = [...policies].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const decisions: PolicyDecision[] = [];

  for (const policy of ordered) {
    const rules = policy.rules;
    if (rules.allowedProviders?.length && state.provider && !rules.allowedProviders.includes(state.provider)) {
      decisions.push(decision("BLOCK_NEXT_CALL", policy, `${state.provider} is outside the allowed provider set.`, "allowedProviders"));
    }
    if (rules.allowedModels?.length && state.model && !rules.allowedModels.includes(state.model)) {
      decisions.push(decision("BLOCK_NEXT_CALL", policy, `${state.model} is outside the allowed model set.`, "allowedModels"));
    }
    if (rules.maxCostUsd !== undefined) {
      if (state.observedCostUsd >= rules.maxCostUsd) {
        decisions.push(decision("KILL_RUN", policy, `Observed spend ${state.observedCostUsd.toFixed(4)} USD reached the ${rules.maxCostUsd.toFixed(4)} USD hard cap.`, "maxCostUsd"));
      } else if (state.observedCostUsd + (state.projectedNextCallCostUsd ?? 0) > rules.maxCostUsd) {
        decisions.push(decision("BLOCK_NEXT_CALL", policy, "The projected next call would exceed the run spend cap.", "maxCostUsd"));
      }
    }
    if (rules.warnCostUsd !== undefined && state.observedCostUsd >= rules.warnCostUsd && (rules.maxCostUsd === undefined || state.observedCostUsd < rules.maxCostUsd)) {
      decisions.push(decision("WARN", policy, `Observed spend crossed the ${rules.warnCostUsd.toFixed(4)} USD warning threshold.`, "warnCostUsd"));
    }
    if (rules.maxTokens !== undefined && state.tokens >= rules.maxTokens) decisions.push(decision("KILL_RUN", policy, "Token budget reached.", "maxTokens"));
    if (rules.maxTurns !== undefined && state.turns >= rules.maxTurns) decisions.push(decision("KILL_RUN", policy, "Maximum run turns reached.", "maxTurns"));
    if (rules.maxRetries !== undefined && state.retries >= rules.maxRetries) decisions.push(decision("KILL_RUN", policy, "Maximum retries reached.", "maxRetries"));
    if (rules.maxFailedToolCalls !== undefined && state.failedToolCalls >= rules.maxFailedToolCalls) decisions.push(decision("KILL_RUN", policy, "Maximum failed tool calls reached.", "maxFailedToolCalls"));
    if (rules.maxToolCalls !== undefined && state.toolCalls >= rules.maxToolCalls) decisions.push(decision("KILL_RUN", policy, "Maximum tool calls reached.", "maxToolCalls"));
    if (rules.maxElapsedMs !== undefined && state.elapsedMs >= rules.maxElapsedMs) decisions.push(decision("KILL_RUN", policy, "Maximum elapsed runtime reached.", "maxElapsedMs"));
    if (rules.maxProviderRounds !== undefined && state.providerRounds >= rules.maxProviderRounds) decisions.push(decision("KILL_RUN", policy, "Maximum provider rounds reached.", "maxProviderRounds"));
    if (rules.maxResultBytes !== undefined && state.resultBytes >= rules.maxResultBytes) decisions.push(decision("KILL_RUN", policy, "Maximum result size reached.", "maxResultBytes"));
    if (rules.maxContextUtilizationPct !== undefined && (state.contextUtilizationPct ?? 0) >= rules.maxContextUtilizationPct) {
      decisions.push(decision("BLOCK_NEXT_CALL", policy, "Context utilization reached the configured ceiling.", "maxContextUtilizationPct"));
    }
    const actionCategory = state.actionCategory?.toLowerCase();
    if (actionCategory && rules.blockedActionCategories?.includes(actionCategory)) {
      decisions.push(decision("BLOCK_NEXT_CALL", policy, `${state.actionName ?? actionCategory} is in a blocked action category.`, "blockedActionCategories"));
    }
    if (actionCategory && rules.approvalActionCategories?.includes(actionCategory)) {
      decisions.push(decision("REQUIRE_APPROVAL", policy, `${state.actionName ?? actionCategory} requires human approval for this action category.`, "approvalActionCategories"));
    }
    if (state.actionRisk && rules.maxAutonomousActionRisk !== undefined && RISK_RANK[state.actionRisk] > RISK_RANK[rules.maxAutonomousActionRisk]) {
      decisions.push(decision("REQUIRE_APPROVAL", policy, `${state.actionName ?? "Action"} is ${state.actionRisk} risk, above the ${rules.maxAutonomousActionRisk} autonomous-risk ceiling.`, "maxAutonomousActionRisk"));
    }
    if (rules.disableFallback && state.isFallback) decisions.push(decision("DISABLE_FALLBACK", policy, "Fallbacks are disabled by policy.", "disableFallback"));
    if (rules.fallbackPremiumApprovalUsd !== undefined && state.isFallback && (state.fallbackPremiumUsd ?? 0) >= rules.fallbackPremiumApprovalUsd) {
      decisions.push(decision("REQUIRE_APPROVAL", policy, "Fallback premium requires explicit approval.", "fallbackPremiumApprovalUsd"));
    }
  }

  return strongest(decisions);
}

export function composeRestrictiveRules(policies: EvaluatedPolicy[]): PolicyRuleSet {
  const result: PolicyRuleSet = {};
  const mins: Array<keyof Pick<PolicyRuleSet, "maxCostUsd" | "warnCostUsd" | "maxTokens" | "maxTurns" | "maxRetries" | "maxFailedToolCalls" | "maxToolCalls" | "maxElapsedMs" | "maxProviderRounds" | "maxResultBytes" | "maxContextUtilizationPct" | "fallbackPremiumApprovalUsd">> = [
    "maxCostUsd", "warnCostUsd", "maxTokens", "maxTurns", "maxRetries", "maxFailedToolCalls", "maxToolCalls", "maxElapsedMs", "maxProviderRounds", "maxResultBytes", "maxContextUtilizationPct", "fallbackPremiumApprovalUsd",
  ];
  for (const key of mins) {
    const values = policies.map((policy) => policy.rules[key]).filter((value): value is number => typeof value === "number");
    if (values.length) result[key] = Math.min(...values) as never;
  }
  const riskCeilings = policies.map((policy) => policy.rules.maxAutonomousActionRisk).filter((value): value is ActionRisk => value !== undefined);
  if (riskCeilings.length) result.maxAutonomousActionRisk = riskCeilings.reduce((lowest, current) => RISK_RANK[current] < RISK_RANK[lowest] ? current : lowest);
  const approvalCategories = policies.flatMap((policy) => policy.rules.approvalActionCategories ?? []);
  if (approvalCategories.length) result.approvalActionCategories = Array.from(new Set(approvalCategories));
  const blockedCategories = policies.flatMap((policy) => policy.rules.blockedActionCategories ?? []);
  if (blockedCategories.length) result.blockedActionCategories = Array.from(new Set(blockedCategories));
  const providerSets = policies.map((policy) => policy.rules.allowedProviders).filter((value): value is string[] => Array.isArray(value));
  if (providerSets.length) result.allowedProviders = providerSets.reduce((intersection, current) => intersection.filter((item) => current.includes(item)));
  const modelSets = policies.map((policy) => policy.rules.allowedModels).filter((value): value is string[] => Array.isArray(value));
  if (modelSets.length) result.allowedModels = modelSets.reduce((intersection, current) => intersection.filter((item) => current.includes(item)));
  result.disableFallback = policies.some((policy) => policy.rules.disableFallback === true);
  return result;
}
