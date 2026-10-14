export type ChangeEffectivenessClass = "insufficient_evidence" | "improved" | "worsened" | "neutral" | "confounded";
export type OptimizationChangeSource = "token_intelligence" | "manual";
export type DailyCostCoverage = "complete" | "partial" | "none";

export interface OptimizationChangeWindow {
  changeId: string;
  ruleId: string;
  appliedAt: string;
  stoppedAt?: string | null;
  collector: string;
  projectId?: string | null;
  source: OptimizationChangeSource;
}

export interface DailyOptimizationMetric {
  periodStart: string;
  collector: string;
  projectId: string | null;
  promptEquivalentCount: number;
  llmCalls: number;
  toolCalls: number;
  toolErrorCount: number | null;
  callsPastContextThreshold: number | null;
  compactionCount: number | null;
  compactionWaitMs: number | null;
  knownCostUsd: number | null;
  costCoverage: DailyCostCoverage;
}

export interface ChangeEffectivenessPolicy {
  preWindowDays: number;
  postWindowDays: number;
  minPreActiveDays: number;
  minPostActiveDays: number;
  minPostPrompts: number;
  neutralBandPct: number;
}

export const DEFAULT_CHANGE_EFFECTIVENESS_POLICY: ChangeEffectivenessPolicy = {
  preWindowDays: 14,
  postWindowDays: 14,
  minPreActiveDays: 3,
  minPostActiveDays: 3,
  minPostPrompts: 100,
  neutralBandPct: 2,
};

export interface AggregatedOptimizationMetrics {
  activeDays: number;
  promptEquivalentCount: number;
  llmCalls: number;
  toolCalls: number;
  toolErrorCount: number | null;
  callsPastContextThreshold: number | null;
  compactionCount: number | null;
  compactionWaitMs: number | null;
  knownCostUsd: number | null;
  costCoverage: DailyCostCoverage;
  costPerPrompt: number | null;
  llmCallsPerPrompt: number | null;
  toolErrorRate: number | null;
  callsPastContextThresholdPerPrompt: number | null;
  compactionsPer100Prompts: number | null;
  compactionWaitMsPerPrompt: number | null;
  projectIds: string[];
}

export interface ChangeEffectivenessReport {
  version: 1;
  change: OptimizationChangeWindow;
  policy: ChangeEffectivenessPolicy;
  evaluationWindow: {
    preStart: string;
    appliedAt: string;
    postEndExclusive: string;
  };
  classification: ChangeEffectivenessClass;
  evidenceFloorMet: boolean;
  pre: AggregatedOptimizationMetrics;
  post: AggregatedOptimizationMetrics;
  primaryOutcome: {
    metric: "cost_per_prompt_equivalent";
    pre: number | null;
    post: number | null;
    deltaUsdPerPrompt: number | null;
    deltaPct: number | null;
    observedCostDifferenceAtPostVolumeUsd: number | null;
  };
  diagnostics: {
    llmCallsPerPromptDeltaPct: number | null;
    toolErrorRateDeltaPoints: number | null;
    callsPastContextThresholdPerPromptDeltaPct: number | null;
    compactionsPer100PromptsDeltaPct: number | null;
    compactionWaitMsPerPromptDeltaPct: number | null;
  };
  confounders: string[];
  warnings: string[];
  claims: {
    causalSavingsClaimed: false;
    verifiedSavingsClaimed: false;
    realizedSavingsClaimed: false;
    eligibleForPairedExperimentVerification: boolean;
  };
  limitations: string[];
}

const DAY_MS = 86_400_000;

function finiteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
  return value;
}

function integerNonNegative(value: number, field: string): number {
  const parsed = finiteNonNegative(value, field);
  if (!Number.isInteger(parsed)) throw new Error(`${field} must be an integer`);
  return parsed;
}

function validDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
  return parsed;
}

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) throw new Error("policy values must be finite numbers");
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function policyWithDefaults(policy?: Partial<ChangeEffectivenessPolicy>): ChangeEffectivenessPolicy {
  const neutralBandPct = policy?.neutralBandPct ?? DEFAULT_CHANGE_EFFECTIVENESS_POLICY.neutralBandPct;
  if (!Number.isFinite(neutralBandPct) || neutralBandPct < 0 || neutralBandPct > 100) throw new Error("neutralBandPct must be between 0 and 100");
  return {
    preWindowDays: boundedInteger(policy?.preWindowDays, DEFAULT_CHANGE_EFFECTIVENESS_POLICY.preWindowDays, 1, 30),
    postWindowDays: boundedInteger(policy?.postWindowDays, DEFAULT_CHANGE_EFFECTIVENESS_POLICY.postWindowDays, 1, 30),
    minPreActiveDays: boundedInteger(policy?.minPreActiveDays, DEFAULT_CHANGE_EFFECTIVENESS_POLICY.minPreActiveDays, 1, 30),
    minPostActiveDays: boundedInteger(policy?.minPostActiveDays, DEFAULT_CHANGE_EFFECTIVENESS_POLICY.minPostActiveDays, 1, 30),
    minPostPrompts: boundedInteger(policy?.minPostPrompts, DEFAULT_CHANGE_EFFECTIVENESS_POLICY.minPostPrompts, 1, 1_000_000),
    neutralBandPct,
  };
}

function validateMetric(metric: DailyOptimizationMetric): DailyOptimizationMetric & { at: Date } {
  const at = validDate(metric.periodStart, "periodStart");
  integerNonNegative(metric.promptEquivalentCount, "promptEquivalentCount");
  integerNonNegative(metric.llmCalls, "llmCalls");
  integerNonNegative(metric.toolCalls, "toolCalls");
  if (metric.toolErrorCount !== null) integerNonNegative(metric.toolErrorCount, "toolErrorCount");
  if (metric.callsPastContextThreshold !== null) integerNonNegative(metric.callsPastContextThreshold, "callsPastContextThreshold");
  if (metric.compactionCount !== null) integerNonNegative(metric.compactionCount, "compactionCount");
  if (metric.compactionWaitMs !== null) finiteNonNegative(metric.compactionWaitMs, "compactionWaitMs");
  if (metric.knownCostUsd !== null) finiteNonNegative(metric.knownCostUsd, "knownCostUsd");
  return { ...metric, at };
}

function sumNullable(values: Array<number | null>): number | null {
  return values.length > 0 && values.every((value): value is number => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null;
}

function ratio(numerator: number | null, denominator: number): number | null {
  return numerator === null || denominator <= 0 ? null : round(numerator / denominator);
}

function aggregate(metrics: Array<DailyOptimizationMetric & { at: Date }>): AggregatedOptimizationMetrics {
  const active = metrics.filter((metric) => metric.promptEquivalentCount > 0);
  const prompts = active.reduce((sum, metric) => sum + metric.promptEquivalentCount, 0);
  const llmCalls = active.reduce((sum, metric) => sum + metric.llmCalls, 0);
  const toolCalls = active.reduce((sum, metric) => sum + metric.toolCalls, 0);
  const toolErrors = sumNullable(active.map((metric) => metric.toolErrorCount));
  const pastThreshold = sumNullable(active.map((metric) => metric.callsPastContextThreshold));
  const compactions = sumNullable(active.map((metric) => metric.compactionCount));
  const compactionWaitMs = sumNullable(active.map((metric) => metric.compactionWaitMs));
  const completeCost = active.length > 0 && active.every((metric) => metric.costCoverage === "complete" && metric.knownCostUsd !== null);
  const anyCost = active.some((metric) => metric.knownCostUsd !== null);
  const knownCostUsd = completeCost
    ? round(active.reduce((sum, metric) => sum + (metric.knownCostUsd ?? 0), 0))
    : null;
  const costCoverage: DailyCostCoverage = completeCost ? "complete" : anyCost ? "partial" : "none";
  return {
    activeDays: active.length,
    promptEquivalentCount: prompts,
    llmCalls,
    toolCalls,
    toolErrorCount: toolErrors,
    callsPastContextThreshold: pastThreshold,
    compactionCount: compactions,
    compactionWaitMs,
    knownCostUsd,
    costCoverage,
    costPerPrompt: ratio(knownCostUsd, prompts),
    llmCallsPerPrompt: ratio(llmCalls, prompts),
    toolErrorRate: toolErrors === null || toolCalls <= 0 ? null : round(toolErrors / toolCalls),
    callsPastContextThresholdPerPrompt: ratio(pastThreshold, prompts),
    compactionsPer100Prompts: compactions === null || prompts <= 0 ? null : round((compactions / prompts) * 100),
    compactionWaitMsPerPrompt: ratio(compactionWaitMs, prompts),
    projectIds: [...new Set(active.map((metric) => metric.projectId).filter((value): value is string => Boolean(value)))].sort(),
  };
}

function pctDelta(before: number | null, after: number | null): number | null {
  if (before === null || after === null || before === 0) return null;
  return round(((after - before) / before) * 100);
}

function pointsDelta(before: number | null, after: number | null): number | null {
  return before === null || after === null ? null : round((after - before) * 100);
}

function sameScope(change: OptimizationChangeWindow, other: OptimizationChangeWindow): boolean {
  if (change.collector !== other.collector) return false;
  if (change.projectId && other.projectId && change.projectId !== other.projectId) return false;
  return true;
}

function windowsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function overlappingChangeIds(
  change: OptimizationChangeWindow,
  others: OptimizationChangeWindow[],
  evaluationStart: Date,
  evaluationEnd: Date,
): string[] {
  return others.filter((other) => other.changeId !== change.changeId && sameScope(change, other)).filter((other) => {
    const start = validDate(other.appliedAt, "other change appliedAt");
    const stop = other.stoppedAt ? validDate(other.stoppedAt, "other change stoppedAt") : evaluationEnd;
    return windowsOverlap(evaluationStart, evaluationEnd, start, stop);
  }).map((other) => other.changeId).sort();
}

function preExistingTrend(metrics: Array<DailyOptimizationMetric & { at: Date }>, neutralBandPct: number): boolean {
  const active = metrics.filter((metric) => metric.promptEquivalentCount > 0 && metric.costCoverage === "complete" && metric.knownCostUsd !== null);
  if (active.length < 4) return false;
  const ordered = [...active].sort((a, b) => a.at.getTime() - b.at.getTime());
  const split = Math.floor(ordered.length / 2);
  const first = aggregate(ordered.slice(0, split));
  const second = aggregate(ordered.slice(split));
  const delta = pctDelta(first.costPerPrompt, second.costPerPrompt);
  return delta !== null && delta <= -Math.max(neutralBandPct, 1);
}

export interface ChangeEffectivenessInput {
  change: OptimizationChangeWindow;
  metrics: DailyOptimizationMetric[];
  otherChanges?: OptimizationChangeWindow[];
  policy?: Partial<ChangeEffectivenessPolicy>;
}

export function evaluateChangeEffectiveness(input: ChangeEffectivenessInput): ChangeEffectivenessReport {
  if (!input.change.changeId.trim()) throw new Error("changeId is required");
  if (!input.change.ruleId.trim()) throw new Error("ruleId is required");
  if (!input.change.collector.trim()) throw new Error("collector is required");
  const policy = policyWithDefaults(input.policy);
  const appliedAt = validDate(input.change.appliedAt, "appliedAt");
  const configuredStop = input.change.stoppedAt ? validDate(input.change.stoppedAt, "stoppedAt") : null;
  if (configuredStop && configuredStop.getTime() <= appliedAt.getTime()) throw new Error("stoppedAt must be after appliedAt");

  const preStart = new Date(appliedAt.getTime() - policy.preWindowDays * DAY_MS);
  const policyPostEnd = new Date(appliedAt.getTime() + policy.postWindowDays * DAY_MS);
  const postEnd = configuredStop && configuredStop.getTime() < policyPostEnd.getTime() ? configuredStop : policyPostEnd;

  const validated = input.metrics.map(validateMetric).filter((metric) => metric.collector === input.change.collector);
  const scoped = input.change.projectId
    ? validated.filter((metric) => metric.projectId === input.change.projectId)
    : validated;
  const preMetrics = scoped.filter((metric) => metric.at.getTime() >= preStart.getTime() && metric.at.getTime() < appliedAt.getTime());
  const postMetrics = scoped.filter((metric) => metric.at.getTime() >= appliedAt.getTime() && metric.at.getTime() < postEnd.getTime());
  const pre = aggregate(preMetrics);
  const post = aggregate(postMetrics);
  const warnings: string[] = [];
  const confounders: string[] = [];

  if (!input.change.projectId) {
    const preProjects = new Set(pre.projectIds);
    const postProjects = new Set(post.projectIds);
    const projectSetsDiffer = preProjects.size !== postProjects.size
      || [...preProjects].some((projectId) => !postProjects.has(projectId));
    if (projectSetsDiffer && (preProjects.size > 0 || postProjects.size > 0)) confounders.push("project_mix_shift");
  }

  const overlaps = overlappingChangeIds(input.change, input.otherChanges ?? [], preStart, postEnd);
  if (overlaps.length) confounders.push(`overlapping_changes:${overlaps.join(",")}`);
  if (preExistingTrend(preMetrics, policy.neutralBandPct)) confounders.push("pre_existing_downward_cost_trend");

  const enoughPre = pre.activeDays >= policy.minPreActiveDays && pre.promptEquivalentCount > 0;
  const enoughPost = post.activeDays >= policy.minPostActiveDays && post.promptEquivalentCount >= policy.minPostPrompts;
  const fullCost = pre.costCoverage === "complete" && post.costCoverage === "complete" && pre.costPerPrompt !== null && post.costPerPrompt !== null;
  const evidenceFloorMet = enoughPre && enoughPost && fullCost;

  if (!enoughPre) warnings.push(`Baseline has ${pre.activeDays} active day(s); at least ${policy.minPreActiveDays} are required.`);
  if (!enoughPost) warnings.push(`Post-change evidence has ${post.activeDays} active day(s) and ${post.promptEquivalentCount} prompt-equivalent unit(s); at least ${policy.minPostActiveDays} active days and ${policy.minPostPrompts} prompt-equivalent units are required.`);
  if (!fullCost) warnings.push("Complete known-cost coverage is required on both sides before cost-per-prompt effectiveness is classified.");
  if (pre.toolErrorRate === null || post.toolErrorRate === null) warnings.push("Tool-error diagnostics are incomplete and are not used as a quality-equivalence claim.");
  if (pre.compactionWaitMsPerPrompt === null || post.compactionWaitMsPerPrompt === null) warnings.push("Compaction-wait diagnostics are incomplete for at least one comparison period.");

  const deltaUsdPerPrompt = pre.costPerPrompt === null || post.costPerPrompt === null
    ? null
    : round(post.costPerPrompt - pre.costPerPrompt);
  const deltaPct = pctDelta(pre.costPerPrompt, post.costPerPrompt);
  const observedCostDifferenceAtPostVolumeUsd = pre.costPerPrompt === null || post.knownCostUsd === null
    ? null
    : round(post.knownCostUsd - pre.costPerPrompt * post.promptEquivalentCount);

  let classification: ChangeEffectivenessClass = "insufficient_evidence";
  if (evidenceFloorMet) {
    if (confounders.length) classification = "confounded";
    else if (deltaPct !== null && deltaPct < -policy.neutralBandPct) classification = "improved";
    else if (deltaPct !== null && deltaPct > policy.neutralBandPct) classification = "worsened";
    else classification = "neutral";
  }

  const eligibleForPairedExperimentVerification = classification === "improved" && confounders.length === 0;

  return {
    version: 1,
    change: input.change,
    policy,
    evaluationWindow: {
      preStart: preStart.toISOString(),
      appliedAt: appliedAt.toISOString(),
      postEndExclusive: postEnd.toISOString(),
    },
    classification,
    evidenceFloorMet,
    pre,
    post,
    primaryOutcome: {
      metric: "cost_per_prompt_equivalent",
      pre: pre.costPerPrompt,
      post: post.costPerPrompt,
      deltaUsdPerPrompt,
      deltaPct,
      observedCostDifferenceAtPostVolumeUsd,
    },
    diagnostics: {
      llmCallsPerPromptDeltaPct: pctDelta(pre.llmCallsPerPrompt, post.llmCallsPerPrompt),
      toolErrorRateDeltaPoints: pointsDelta(pre.toolErrorRate, post.toolErrorRate),
      callsPastContextThresholdPerPromptDeltaPct: pctDelta(pre.callsPastContextThresholdPerPrompt, post.callsPastContextThresholdPerPrompt),
      compactionsPer100PromptsDeltaPct: pctDelta(pre.compactionsPer100Prompts, post.compactionsPer100Prompts),
      compactionWaitMsPerPromptDeltaPct: pctDelta(pre.compactionWaitMsPerPrompt, post.compactionWaitMsPerPrompt),
    },
    confounders,
    warnings,
    claims: {
      causalSavingsClaimed: false,
      verifiedSavingsClaimed: false,
      realizedSavingsClaimed: false,
      eligibleForPairedExperimentVerification,
    },
    limitations: [
      "This report is an observational before/after comparison. It does not establish that the change caused the observed delta.",
      "Prompt-equivalent workload is a normalized local activity unit supplied by the caller; it is not assumed to be semantically identical across days.",
      "Observed cost differences are not promoted to verified savings. Token Intelligence's existing paired-run experiment gate remains authoritative for verified savings.",
      "Missing or partial cost evidence stays unknown; it is never converted to zero.",
      "Recommendation estimates from other findings are not added to this comparison.",
    ],
  };
}

function money(value: number | null): string {
  return value === null ? "unknown" : `$${value.toFixed(4)}`;
}

function pct(value: number | null): string {
  return value === null ? "unknown" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatChangeEffectivenessReport(report: ChangeEffectivenessReport): string {
  const lines = [
    "Token Intelligence change effectiveness",
    `Change: ${report.change.ruleId} (${report.change.changeId})`,
    `Collector: ${report.change.collector}`,
    `Project scope: ${report.change.projectId ?? "all observed projects"}`,
    `Classification: ${report.classification}`,
    `Evidence floor met: ${report.evidenceFloorMet ? "yes" : "no"}`,
    `Pre: ${report.pre.activeDays} active day(s), ${report.pre.promptEquivalentCount} prompt-equivalent unit(s), ${money(report.pre.knownCostUsd)} known cost`,
    `Post: ${report.post.activeDays} active day(s), ${report.post.promptEquivalentCount} prompt-equivalent unit(s), ${money(report.post.knownCostUsd)} known cost`,
    `Cost per prompt-equivalent: ${money(report.primaryOutcome.pre)} -> ${money(report.primaryOutcome.post)} (${pct(report.primaryOutcome.deltaPct)})`,
    `Observed cost difference at post volume: ${money(report.primaryOutcome.observedCostDifferenceAtPostVolumeUsd)}`,
    "Savings claim: none; paired experiment verification is still required.",
  ];
  if (report.confounders.length) lines.push("", "Confounders:", ...report.confounders.map((value) => `- ${value}`));
  if (report.warnings.length) lines.push("", "Warnings:", ...report.warnings.map((value) => `- ${value}`));
  return `${lines.join("\n")}\n`;
}
