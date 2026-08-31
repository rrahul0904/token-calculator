export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";
export type FindingConfidence = "measured" | "high" | "medium" | "low" | "estimated";

export interface FindingInputTurn {
  id: string;
  turnIndex: number;
  status: string;
  freshInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  costUsd: number | null;
  contextTokensBefore: number | null;
  contextTokensAfter: number | null;
}

export interface FindingInputToolCall {
  id: string;
  turnId: string | null;
  toolName: string;
  toolCategory: string;
  status: string;
  isRetry: boolean;
  outputSizeBytes: number | null;
  outputTokensEstimated: number | null;
  resourceHash: string | null;
}

export interface FindingInputLlmCall {
  id: string;
  turnId: string | null;
  provider: string;
  modelRequested: string | null;
  modelResolved: string | null;
  costUsd: number | null;
  fallbackFromCallId: string | null;
  attemptIndex: number;
}

export interface RunAnalysisInput {
  runId: string;
  status: string;
  totalCostUsd: number | null;
  outcomeStatus: string | null;
  turns: FindingInputTurn[];
  toolCalls: FindingInputToolCall[];
  llmCalls: FindingInputLlmCall[];
}

export interface FindingResult {
  ruleId: string;
  severity: FindingSeverity;
  title: string;
  evidence: Record<string, unknown>;
  estimatedWasteTokens: number | null;
  estimatedWasteUsd: number | null;
  confidence: FindingConfidence;
  recommendation: string;
  verificationRecipe: string;
}

const tokensFromBytes = (bytes: number) => Math.ceil(bytes / 4);
const dollar = (value: number) => Math.max(0, Math.round(value * 1e8) / 1e8);

function orientationFinding(input: RunAnalysisInput): FindingResult | null {
  const ordered = [...input.turns].sort((a, b) => a.turnIndex - b.turnIndex);
  if (ordered.length < 3) return null;
  const earlyTurns = ordered.slice(0, Math.min(3, ordered.length));
  const earlyTokens = earlyTurns.reduce((sum, turn) => sum + turn.freshInputTokens + turn.cacheReadTokens, 0);
  const allTokens = ordered.reduce((sum, turn) => sum + turn.freshInputTokens + turn.cacheReadTokens, 0);
  const toolOnlyEarly = input.toolCalls.filter((tool) => earlyTurns.some((turn) => turn.id === tool.turnId) && ["filesystem", "search", "shell"].includes(tool.toolCategory));
  if (allTokens < 20_000 || earlyTokens / Math.max(allTokens, 1) < 0.3 || toolOnlyEarly.length < 3) return null;
  return {
    ruleId: "orientation-heavy",
    severity: earlyTokens / allTokens > 0.5 ? "high" : "medium",
    title: "High context spend during early orientation",
    evidence: { earlyTurns: earlyTurns.map((turn) => turn.turnIndex), earlyInputTokens: earlyTokens, totalInputSideTokens: allTokens, orientationToolCalls: toolOnlyEarly.length },
    estimatedWasteTokens: null,
    estimatedWasteUsd: null,
    confidence: "medium",
    recommendation: "Provide durable repository/task context and measure whether early discovery reads fall without lowering task success.",
    verificationRecipe: "Repeat an equivalent task and compare pre-action input share while requiring the same success oracle.",
  };
}

function repeatedReads(input: RunAnalysisInput): FindingResult | null {
  const reads = input.toolCalls.filter((tool) => tool.toolCategory === "filesystem" && tool.resourceHash && tool.status === "completed");
  const grouped = new Map<string, FindingInputToolCall[]>();
  for (const read of reads) grouped.set(read.resourceHash!, [...(grouped.get(read.resourceHash!) ?? []), read]);
  const repeated = [...grouped.entries()].filter(([, calls]) => calls.length > 1);
  if (!repeated.length) return null;
  const estimatedWasteTokens = repeated.reduce((sum, [, calls]) => sum + calls.slice(1).reduce((inner, call) => inner + (call.outputTokensEstimated ?? (call.outputSizeBytes ? tokensFromBytes(call.outputSizeBytes) : 0)), 0), 0);
  return {
    ruleId: "repeated-resource-read",
    severity: repeated.length >= 4 ? "high" : "medium",
    title: "Resources were re-read within the same run",
    evidence: { repeatedResources: repeated.map(([hash, calls]) => ({ resourceHash: hash, reads: calls.length })) },
    estimatedWasteTokens: estimatedWasteTokens || null,
    estimatedWasteUsd: null,
    confidence: estimatedWasteTokens > 0 ? "estimated" : "medium",
    recommendation: "Keep stable findings in concise working context or avoid repeated reads when the resource has not changed.",
    verificationRecipe: "Run the same task after the change and confirm repeated resource reads decrease at equivalent outcome status.",
  };
}

function oversizedToolOutput(input: RunAnalysisInput): FindingResult | null {
  const offenders = input.toolCalls.filter((tool) => (tool.outputTokensEstimated ?? (tool.outputSizeBytes ? tokensFromBytes(tool.outputSizeBytes) : 0)) >= 8_000);
  if (!offenders.length) return null;
  const waste = offenders.reduce((sum, tool) => sum + (tool.outputTokensEstimated ?? (tool.outputSizeBytes ? tokensFromBytes(tool.outputSizeBytes) : 0)), 0);
  return {
    ruleId: "oversized-tool-output",
    severity: waste > 40_000 ? "high" : "medium",
    title: "Large tool results are likely increasing carried context",
    evidence: { calls: offenders.map((tool) => ({ id: tool.id, tool: tool.toolName, outputBytes: tool.outputSizeBytes, outputTokensEstimated: tool.outputTokensEstimated })) },
    estimatedWasteTokens: waste,
    estimatedWasteUsd: null,
    confidence: "estimated",
    recommendation: "Cap, summarize, paginate, or filter tool output before it enters later-turn context.",
    verificationRecipe: "Repeat the run with bounded tool output and verify lower later-turn input tokens at the same task outcome.",
  };
}

function retryLoops(input: RunAnalysisInput): FindingResult | null {
  const retries = input.toolCalls.filter((tool) => tool.isRetry || tool.status === "failed");
  if (retries.length < 2) return null;
  return {
    ruleId: "tool-retry-loop",
    severity: retries.length >= 5 ? "critical" : "high",
    title: "Repeated tool failures or retries consumed run budget",
    evidence: { count: retries.length, calls: retries.map((tool) => ({ id: tool.id, tool: tool.toolName, status: tool.status, retry: tool.isRetry })) },
    estimatedWasteTokens: retries.reduce((sum, tool) => sum + (tool.outputTokensEstimated ?? 0), 0) || null,
    estimatedWasteUsd: null,
    confidence: "measured",
    recommendation: "Bound retries and record the failure cause so the agent changes strategy instead of repeating the same operation.",
    verificationRecipe: "Re-run with the retry cap/fix and require the same success outcome with fewer failed tool calls.",
  };
}

function contextGrowth(input: RunAnalysisInput): FindingResult | null {
  const withContext = input.turns.filter((turn) => turn.contextTokensBefore !== null && turn.contextTokensAfter !== null);
  if (withContext.length < 2) return null;
  const start = withContext[0].contextTokensBefore ?? 0;
  const end = withContext[withContext.length - 1].contextTokensAfter ?? 0;
  const growth = end - start;
  if (growth < 50_000 && (start === 0 || end / Math.max(start, 1) < 2)) return null;
  return {
    ruleId: "excessive-context-growth",
    severity: growth >= 150_000 ? "high" : "medium",
    title: "Run context grew substantially across turns",
    evidence: { contextStart: start, contextEnd: end, growthTokens: growth },
    estimatedWasteTokens: null,
    estimatedWasteUsd: null,
    confidence: "measured",
    recommendation: "Compact stale context and avoid carrying large tool results or superseded intermediate state.",
    verificationRecipe: "Compare equivalent runs and confirm late-turn input/context falls without reducing outcome quality.",
  };
}

function cacheBlindSpot(input: RunAnalysisInput): FindingResult | null {
  const writes = input.turns.reduce((sum, turn) => sum + turn.cacheWriteTokens, 0);
  const reads = input.turns.reduce((sum, turn) => sum + turn.cacheReadTokens, 0);
  if (writes < 10_000 || reads > writes * 0.1) return null;
  return {
    ruleId: "cache-blind-spot",
    severity: writes > 100_000 ? "high" : "medium",
    title: "Cache writes are not translating into meaningful cache reads",
    evidence: { cacheWriteTokens: writes, cacheReadTokens: reads, readWriteRatio: reads / Math.max(writes, 1) },
    estimatedWasteTokens: null,
    estimatedWasteUsd: null,
    confidence: "measured",
    recommendation: "Stabilize reusable prefixes and confirm provider cache semantics before relying on cache savings.",
    verificationRecipe: "Run comparable workloads and verify cache-read tokens increase while outcome quality remains constant.",
  };
}

function fallbackPremium(input: RunAnalysisInput): FindingResult | null {
  const fallbacks = input.llmCalls.filter((call) => call.fallbackFromCallId);
  if (!fallbacks.length) return null;
  const premium = fallbacks.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
  return {
    ruleId: "fallback-premium",
    severity: premium >= 5 ? "high" : premium >= 1 ? "medium" : "low",
    title: "Fallback calls increased run spend",
    evidence: { count: fallbacks.length, fallbackCostUsd: dollar(premium), calls: fallbacks.map((call) => ({ id: call.id, model: call.modelResolved, from: call.fallbackFromCallId, costUsd: call.costUsd })) },
    estimatedWasteTokens: null,
    estimatedWasteUsd: premium > 0 ? dollar(premium) : null,
    confidence: "measured",
    recommendation: "Require approval or constrain fallback routes when the premium is material and the higher-cost model is not outcome-critical.",
    verificationRecipe: "Compare approved fallback vs constrained routing on equivalent tasks and require equal outcome success.",
  };
}

function noOutcome(input: RunAnalysisInput): FindingResult | null {
  if ((input.totalCostUsd ?? 0) < 0.25 || input.outcomeStatus) return null;
  return {
    ruleId: "spend-without-verified-outcome",
    severity: (input.totalCostUsd ?? 0) >= 5 ? "high" : "medium",
    title: "Meaningful spend has no verified outcome receipt",
    evidence: { costUsd: input.totalCostUsd, runStatus: input.status },
    estimatedWasteTokens: null,
    estimatedWasteUsd: null,
    confidence: "measured",
    recommendation: "Attach a success oracle or engineering outcome such as tests, commit, PR, CI, merge, or deployment before judging efficiency.",
    verificationRecipe: "Link the run to an explicit outcome and only then compare cost efficiency against equivalent successful runs.",
  };
}

export function analyzeRun(input: RunAnalysisInput): FindingResult[] {
  return [orientationFinding(input), repeatedReads(input), oversizedToolOutput(input), retryLoops(input), contextGrowth(input), cacheBlindSpot(input), fallbackPremium(input), noOutcome(input)].filter((finding): finding is FindingResult => finding !== null);
}
