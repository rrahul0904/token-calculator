export type PolicyAction = "ALLOW" | "WARN" | "NOTIFY" | "REQUIRE_APPROVAL" | "DISABLE_FALLBACK" | "BLOCK_NEXT_CALL" | "KILL_RUN";

export interface PolicyRuleSet {
  maxCostUsd?: number;
  warnCostUsd?: number;
  maxTokens?: number;
  maxTurns?: number;
  maxRetries?: number;
  maxFailedToolCalls?: number;
  maxToolCalls?: number;
  maxContextUtilizationPct?: number;
  allowedProviders?: string[];
  allowedModels?: string[];
  fallbackPremiumApprovalUsd?: number;
  disableFallback?: boolean;
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
  contextUtilizationPct?: number;
  provider?: string;
  model?: string;
  fallbackPremiumUsd?: number;
  isFallback?: boolean;
}

export interface PolicyDecision {
  action: PolicyAction;
  reason: string;
  policyIds: string[];
  constraints: string[];
}

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
    if (rules.maxContextUtilizationPct !== undefined && (state.contextUtilizationPct ?? 0) >= rules.maxContextUtilizationPct) {
      decisions.push(decision("BLOCK_NEXT_CALL", policy, "Context utilization reached the configured ceiling.", "maxContextUtilizationPct"));
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
  const mins: Array<keyof Pick<PolicyRuleSet, "maxCostUsd" | "warnCostUsd" | "maxTokens" | "maxTurns" | "maxRetries" | "maxFailedToolCalls" | "maxToolCalls" | "maxContextUtilizationPct" | "fallbackPremiumApprovalUsd">> = [
    "maxCostUsd", "warnCostUsd", "maxTokens", "maxTurns", "maxRetries", "maxFailedToolCalls", "maxToolCalls", "maxContextUtilizationPct", "fallbackPremiumApprovalUsd",
  ];
  for (const key of mins) {
    const values = policies.map((policy) => policy.rules[key]).filter((value): value is number => typeof value === "number");
    if (values.length) result[key] = Math.min(...values) as never;
  }
  const providerSets = policies.map((policy) => policy.rules.allowedProviders).filter((value): value is string[] => Array.isArray(value));
  if (providerSets.length) result.allowedProviders = providerSets.reduce((intersection, current) => intersection.filter((item) => current.includes(item)));
  const modelSets = policies.map((policy) => policy.rules.allowedModels).filter((value): value is string[] => Array.isArray(value));
  if (modelSets.length) result.allowedModels = modelSets.reduce((intersection, current) => intersection.filter((item) => current.includes(item)));
  result.disableFallback = policies.some((policy) => policy.rules.disableFallback === true);
  return result;
}
