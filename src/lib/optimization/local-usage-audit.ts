import type { CollectorParseResult } from "@/lib/collectors/types";
import { analyzeRun, type FindingConfidence, type FindingResult, type FindingSeverity, type RunAnalysisInput } from "@/lib/findings/engine";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

export type LocalAuditCategory = "context" | "redundancy" | "reasoning" | "caching" | "routing" | "verification";

export interface LocalAuditRecommendation {
  ruleId: string;
  runId: string | null;
  category: LocalAuditCategory;
  severity: FindingSeverity;
  title: string;
  evidence: Record<string, unknown>;
  estimatedWasteTokens: number | null;
  estimatedWasteUsd: number | null;
  confidence: FindingConfidence;
  recommendation: string;
  verificationRecipe: string;
}

export interface LocalUsageAuditReport {
  version: 1;
  generatedAt: string;
  source: string;
  sessionId: string;
  usageClassification: CollectorParseResult["usageClassification"];
  privacy: {
    localOnly: true;
    contentStored: false;
    rawPromptContentInspected: false;
    networkRequestsRequired: false;
  };
  summary: {
    runs: number;
    turns: number;
    llmCalls: number;
    toolCalls: number;
    freshInputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    outputTokens: number;
    knownCostUsd: number | null;
  };
  opportunity: {
    findingsWithTokenEstimate: number;
    largestSingleFindingWasteTokens: number | null;
    findingsWithUsdEstimate: number;
    largestSingleFindingWasteUsd: number | null;
    additiveSavingsClaimed: false;
    note: string;
  };
  recommendations: LocalAuditRecommendation[];
  warnings: string[];
  limitations: string[];
}

interface RunReceiptLite {
  id: string;
  status: string;
  totalCostUsd: number | null;
  outcomeStatus: string | null;
  freshInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  outputTokens: number;
}

interface TurnReceiptLite {
  id: string;
  runId: string;
  turnIndex: number;
  status: string;
  modelResolved: string | null;
  reasoningEffort: string | null;
  freshInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  costUsd: number | null;
  contextTokensBefore: number | null;
  contextTokensAfter: number | null;
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringValue = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
const numberValue = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const booleanValue = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const countValue = (value: unknown): number => Math.max(0, Math.trunc(numberValue(value) ?? 0));
const nullableCount = (value: unknown): number | null => {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.max(0, Math.trunc(parsed));
};
const firstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

function eventRunId(event: TelemetryEventInput, payload: Record<string, unknown>): string | null {
  return stringValue(event.runId) ?? stringValue(payload.runId) ?? (event.eventType === "run.upsert" ? stringValue(payload.id) : null);
}

function parseRun(event: TelemetryEventInput): RunReceiptLite | null {
  if (event.eventType !== "run.upsert") return null;
  const payload = asRecord(event.payload);
  const id = eventRunId(event, payload);
  if (!id) return null;
  return {
    id,
    status: stringValue(payload.status) ?? "unknown",
    totalCostUsd: firstNumber(payload.reconciledCostUsd, payload.actualCostUsd, payload.estimatedCostUsd),
    outcomeStatus: stringValue(payload.outcomeStatus),
    freshInputTokens: countValue(payload.freshInputTokens),
    cacheReadTokens: countValue(payload.cacheReadTokens),
    cacheWriteTokens: countValue(payload.cacheWriteTokens),
    reasoningTokens: countValue(payload.reasoningTokens),
    outputTokens: countValue(payload.outputTokens),
  };
}

function parseTurn(event: TelemetryEventInput): TurnReceiptLite | null {
  if (event.eventType !== "turn.upsert") return null;
  const payload = asRecord(event.payload);
  const id = stringValue(payload.id);
  const runId = eventRunId(event, payload);
  if (!id || !runId) return null;
  return {
    id,
    runId,
    turnIndex: countValue(payload.turnIndex),
    status: stringValue(payload.status) ?? "unknown",
    modelResolved: stringValue(payload.modelResolved) ?? stringValue(payload.modelRequested),
    reasoningEffort: stringValue(payload.reasoningEffort),
    freshInputTokens: countValue(payload.freshInputTokens),
    cacheReadTokens: countValue(payload.cacheReadTokens),
    cacheWriteTokens: countValue(payload.cacheWriteTokens),
    reasoningTokens: countValue(payload.reasoningTokens),
    outputTokens: countValue(payload.outputTokens),
    costUsd: numberValue(payload.costUsd),
    contextTokensBefore: nullableCount(payload.contextTokensBefore),
    contextTokensAfter: nullableCount(payload.contextTokensAfter),
  };
}

function toolOperation(payload: Record<string, unknown>) {
  const metadata = asRecord(payload.metadata);
  const value = stringValue(payload.operation) ?? stringValue(metadata.operation);
  return value && ["read", "edit", "write", "delete", "execute", "search", "other"].includes(value)
    ? value as "read" | "edit" | "write" | "delete" | "execute" | "search" | "other"
    : undefined;
}

function stringFromPayloadOrMetadata(payload: Record<string, unknown>, key: string) {
  return stringValue(payload[key]) ?? stringValue(asRecord(payload.metadata)[key]);
}

function categoryForFinding(ruleId: string): LocalAuditCategory {
  if (["repeated-resource-read", "tool-retry-loop", "same-resource-edit-churn"].includes(ruleId)) return "redundancy";
  if (["orientation-heavy", "oversized-tool-output", "excessive-context-growth"].includes(ruleId)) return "context";
  if (ruleId === "cache-blind-spot") return "caching";
  if (["fallback-premium", "oversized-model-route"].includes(ruleId)) return "routing";
  return "verification";
}

function reasoningRecommendation(turns: TurnReceiptLite[]): LocalAuditRecommendation | null {
  const candidates = turns.filter((turn) => {
    const effort = turn.reasoningEffort?.toLowerCase() ?? "";
    const explicitHighEffort = ["high", "xhigh", "extra-high", "max"].includes(effort);
    const reasoningDominates = turn.reasoningTokens >= 2_000 && turn.reasoningTokens >= Math.max(turn.outputTokens * 2, Math.ceil(turn.freshInputTokens * 0.5));
    const exceptionallyLarge = turn.reasoningTokens >= 10_000 && turn.reasoningTokens >= turn.outputTokens * 2;
    return (explicitHighEffort && reasoningDominates) || exceptionallyLarge;
  });
  if (!candidates.length) return null;

  const reasoningTokens = candidates.reduce((sum, turn) => sum + turn.reasoningTokens, 0);
  return {
    ruleId: "reasoning-review-candidate",
    runId: candidates.length === 1 ? candidates[0].runId : null,
    category: "reasoning",
    severity: reasoningTokens >= 25_000 ? "high" : "medium",
    title: "High reasoning spend is a benchmark candidate",
    evidence: {
      turns: candidates.map((turn) => ({ runId: turn.runId, turnIndex: turn.turnIndex, model: turn.modelResolved, reasoningEffort: turn.reasoningEffort, reasoningTokens: turn.reasoningTokens, outputTokens: turn.outputTokens })),
      reasoningTokens,
      semanticTaskComplexityInferred: false,
    },
    estimatedWasteTokens: null,
    estimatedWasteUsd: null,
    confidence: "measured",
    recommendation: "Benchmark a lower reasoning effort on the same versioned task set before changing defaults. High reasoning usage is a review signal, not proof that the task was simple or that the tokens were wasted.",
    verificationRecipe: "Run equivalent tasks at lower and current reasoning effort and require non-inferior task outcomes before adopting the cheaper setting.",
  };
}

function findingRecommendation(runId: string, finding: FindingResult): LocalAuditRecommendation {
  return { runId, category: categoryForFinding(finding.ruleId), ...finding };
}

function summaryFromRuns(runs: RunReceiptLite[], turns: TurnReceiptLite[]) {
  const runTokenTotal = runs.reduce((sum, run) => sum + run.freshInputTokens + run.cacheReadTokens + run.cacheWriteTokens + run.reasoningTokens + run.outputTokens, 0);
  const source = runs.length > 0 && runTokenTotal > 0 ? runs : turns;
  const totals = source.reduce((acc, item) => ({
    freshInputTokens: acc.freshInputTokens + item.freshInputTokens,
    cacheReadTokens: acc.cacheReadTokens + item.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens + item.cacheWriteTokens,
    reasoningTokens: acc.reasoningTokens + item.reasoningTokens,
    outputTokens: acc.outputTokens + item.outputTokens,
  }), { freshInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, outputTokens: 0 });
  const runCosts = runs.map((run) => run.totalCostUsd).filter((value): value is number => value !== null);
  const turnCosts = turns.map((turn) => turn.costUsd).filter((value): value is number => value !== null);
  const costs = runCosts.length ? runCosts : turnCosts;
  return { ...totals, knownCostUsd: costs.length ? Math.round(costs.reduce((sum, value) => sum + value, 0) * 1e8) / 1e8 : null };
}

export function auditCollectorResult(result: CollectorParseResult, options: { generatedAt?: string } = {}): LocalUsageAuditReport {
  const runs = new Map<string, RunReceiptLite>();
  const turns = new Map<string, TurnReceiptLite>();
  const toolCalls = new Map<string, RunAnalysisInput["toolCalls"][number] & { runId: string }>();
  const llmCalls = new Map<string, RunAnalysisInput["llmCalls"][number] & { runId: string }>();
  const outcomes = new Map<string, string>();

  for (const event of result.events) {
    const payload = asRecord(event.payload);
    const run = parseRun(event);
    if (run) runs.set(run.id, run);

    const turn = parseTurn(event);
    if (turn) turns.set(turn.id, turn);

    const runId = eventRunId(event, payload);
    if (event.eventType === "tool_call.recorded" && runId) {
      const id = stringValue(payload.id) ?? event.sourceEventId;
      toolCalls.set(id, {
        id,
        runId,
        turnId: stringValue(payload.turnId),
        toolName: stringValue(payload.toolName) ?? "unknown",
        toolCategory: stringValue(payload.toolCategory) ?? "other",
        status: stringValue(payload.status) ?? "unknown",
        isRetry: booleanValue(payload.isRetry) ?? countValue(payload.attemptIndex) > 0,
        outputSizeBytes: nullableCount(payload.outputSizeBytes),
        outputTokensEstimated: nullableCount(payload.outputTokensEstimated),
        resourceHash: stringValue(payload.resourceHash),
        operation: toolOperation(payload),
        resourceVersionBefore: stringFromPayloadOrMetadata(payload, "resourceVersionBefore"),
        resourceVersionAfter: stringFromPayloadOrMetadata(payload, "resourceVersionAfter"),
      });
    }

    if (event.eventType === "llm_call.recorded" && runId) {
      const id = stringValue(payload.id) ?? event.sourceEventId;
      llmCalls.set(id, {
        id,
        runId,
        turnId: stringValue(payload.turnId),
        provider: stringValue(payload.provider) ?? result.collector,
        modelRequested: stringValue(payload.modelRequested),
        modelResolved: stringValue(payload.modelResolved),
        costUsd: numberValue(payload.costUsd),
        fallbackFromCallId: stringValue(payload.fallbackFromCallId),
        attemptIndex: countValue(payload.attemptIndex),
      });
    }

    if (event.eventType === "outcome.recorded" && runId) {
      const status = stringValue(payload.status);
      if (status) outcomes.set(runId, status);
    }
  }

  const allRunIds = new Set<string>([
    ...runs.keys(),
    ...[...turns.values()].map((turn) => turn.runId),
    ...[...toolCalls.values()].map((call) => call.runId),
    ...[...llmCalls.values()].map((call) => call.runId),
  ]);

  const recommendations: LocalAuditRecommendation[] = [];
  for (const runId of allRunIds) {
    const run = runs.get(runId);
    const runTurns = [...turns.values()].filter((turn) => turn.runId === runId);
    const runToolCalls = [...toolCalls.values()].filter((call) => call.runId === runId).map(({ runId: _runId, ...call }) => call);
    const runLlmCalls = [...llmCalls.values()].filter((call) => call.runId === runId).map(({ runId: _runId, ...call }) => call);
    const analysis: RunAnalysisInput = {
      runId,
      status: run?.status ?? "unknown",
      totalCostUsd: run?.totalCostUsd ?? null,
      outcomeStatus: outcomes.get(runId) ?? run?.outcomeStatus ?? null,
      turns: runTurns.map((turn) => ({
        id: turn.id,
        turnIndex: turn.turnIndex,
        status: turn.status,
        freshInputTokens: turn.freshInputTokens,
        cacheReadTokens: turn.cacheReadTokens,
        cacheWriteTokens: turn.cacheWriteTokens,
        outputTokens: turn.outputTokens,
        costUsd: turn.costUsd,
        contextTokensBefore: turn.contextTokensBefore,
        contextTokensAfter: turn.contextTokensAfter,
      })),
      toolCalls: runToolCalls,
      llmCalls: runLlmCalls,
    };
    recommendations.push(...analyzeRun(analysis).map((finding) => findingRecommendation(runId, finding)));
  }

  const reasoning = reasoningRecommendation([...turns.values()]);
  if (reasoning) recommendations.push(reasoning);

  recommendations.sort((a, b) => {
    const rank: Record<FindingSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
    return rank[b.severity] - rank[a.severity] || a.ruleId.localeCompare(b.ruleId);
  });

  const runList = [...runs.values()];
  const turnList = [...turns.values()];
  const totals = summaryFromRuns(runList, turnList);
  const tokenEstimates = recommendations.map((item) => item.estimatedWasteTokens).filter((value): value is number => value !== null && value > 0);
  const usdEstimates = recommendations.map((item) => item.estimatedWasteUsd).filter((value): value is number => value !== null && value > 0);
  const limitations = [
    "Token and dollar opportunity estimates from different findings can overlap and are intentionally not summed.",
    "A high-cost model is not labeled waste without comparable successful-run or experiment evidence.",
    "High reasoning usage is flagged for benchmarking only; task simplicity is not inferred from private prompt content.",
  ];
  if (!llmCalls.size) limitations.push("This trace has no normalized per-call LLM receipts, so fallback-cost analysis may be unavailable.");
  if (!runList.some((run) => run.totalCostUsd !== null)) limitations.push("No collector-reported run cost was available; the audit does not invent dollar savings from tokens alone.");

  return {
    version: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: result.collector,
    sessionId: result.sessionId,
    usageClassification: result.usageClassification,
    privacy: { localOnly: true, contentStored: false, rawPromptContentInspected: false, networkRequestsRequired: false },
    summary: {
      runs: allRunIds.size,
      turns: turns.size,
      llmCalls: llmCalls.size,
      toolCalls: toolCalls.size,
      ...totals,
    },
    opportunity: {
      findingsWithTokenEstimate: tokenEstimates.length,
      largestSingleFindingWasteTokens: tokenEstimates.length ? Math.max(...tokenEstimates) : null,
      findingsWithUsdEstimate: usdEstimates.length,
      largestSingleFindingWasteUsd: usdEstimates.length ? Math.max(...usdEstimates) : null,
      additiveSavingsClaimed: false,
      note: "Largest single supported opportunity is shown because findings can overlap; no additive savings claim is made.",
    },
    recommendations,
    warnings: [...result.warnings],
    limitations,
  };
}

function tokenLabel(value: number | null) {
  return value === null ? "not quantified" : value.toLocaleString("en-US");
}

function usdLabel(value: number | null) {
  return value === null ? "not quantified" : `$${value.toFixed(4)}`;
}

export function formatLocalUsageAuditReport(report: LocalUsageAuditReport): string {
  const lines = [
    "Token Intelligence local usage audit",
    `Source: ${report.source} · session ${report.sessionId} · ${report.usageClassification}`,
    "Privacy: local-only analysis of normalized metadata; prompt/code/transcript content is not inspected or uploaded.",
    "",
    `Runs ${report.summary.runs} · turns ${report.summary.turns} · LLM calls ${report.summary.llmCalls} · tool calls ${report.summary.toolCalls}`,
    `Tokens: input ${report.summary.freshInputTokens.toLocaleString("en-US")} · cache-read ${report.summary.cacheReadTokens.toLocaleString("en-US")} · cache-write ${report.summary.cacheWriteTokens.toLocaleString("en-US")} · reasoning ${report.summary.reasoningTokens.toLocaleString("en-US")} · output ${report.summary.outputTokens.toLocaleString("en-US")}`,
    `Known spend: ${usdLabel(report.summary.knownCostUsd)}`,
    `Largest single token opportunity: ${tokenLabel(report.opportunity.largestSingleFindingWasteTokens)}`,
    `Largest single dollar opportunity: ${usdLabel(report.opportunity.largestSingleFindingWasteUsd)}`,
    "Savings note: findings may overlap, so Token Intelligence does not add them into a headline savings total.",
    "",
  ];

  if (!report.recommendations.length) lines.push("No supported optimization findings were detected in this trace.");
  for (const finding of report.recommendations) {
    lines.push(`[${finding.severity.toUpperCase()}] ${finding.title} (${finding.category})`);
    lines.push(`  Recommendation: ${finding.recommendation}`);
    lines.push(`  Verify: ${finding.verificationRecipe}`);
    if (finding.estimatedWasteTokens !== null) lines.push(`  Estimated token opportunity: ${finding.estimatedWasteTokens.toLocaleString("en-US")}`);
    if (finding.estimatedWasteUsd !== null) lines.push(`  Estimated dollar opportunity: ${usdLabel(finding.estimatedWasteUsd)}`);
  }

  if (report.warnings.length) {
    lines.push("", "Collector warnings:");
    for (const warning of report.warnings) lines.push(`  - ${warning}`);
  }
  lines.push("", "Limitations:");
  for (const limitation of report.limitations) lines.push(`  - ${limitation}`);
  return `${lines.join("\n")}\n`;
}
