import { createHash } from "node:crypto";
import type { CollectorAdapter, CollectorContext, CollectorParseResult } from "@/lib/collectors/types";
import { numberValue, parseJsonLine, safeRecord, stringValue } from "@/lib/collectors/types";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

interface TokenSnapshot {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  total: number;
}
interface MutableTurn {
  id: string;
  index: number;
  startedAt: Date;
  endedAt: Date | null;
  status: "running" | "completed" | "aborted" | "compacted" | "failed";
  model: string | null;
  reasoningEffort: string | null;
  freshInput: number;
  cacheRead: number;
  output: number;
  reasoning: number;
  toolCalls: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
function sourceId(sessionId: string, lineIndex: number, kind: string): string {
  return `codex:${sessionId}:${lineIndex}:${kind}`;
}
function dateValue(value: unknown, fallback: Date): Date {
  const raw = stringValue(value);
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
function usageSnapshot(value: unknown): TokenSnapshot | null {
  const usage = safeRecord(value);
  if (!usage) return null;
  const input = Math.max(0, numberValue(usage.input_tokens) ?? 0);
  const cached = Math.max(0, numberValue(usage.cached_input_tokens) ?? 0);
  const output = Math.max(0, numberValue(usage.output_tokens) ?? 0);
  const reasoning = Math.max(0, numberValue(usage.reasoning_output_tokens) ?? 0);
  if (![usage.input_tokens, usage.cached_input_tokens, usage.output_tokens, usage.reasoning_output_tokens, usage.total_tokens].some((item) => typeof item === "number")) return null;
  return { input, cached, output, reasoning, total: Math.max(0, numberValue(usage.total_tokens) ?? input + output) };
}
function delta(current: TokenSnapshot, previous: TokenSnapshot | null): TokenSnapshot {
  if (!previous) return { ...current, input: Math.max(current.input - current.cached, 0) };
  const rawInput = Math.max(current.input - previous.input, 0);
  const cached = Math.max(current.cached - previous.cached, 0);
  return {
    input: Math.max(rawInput - cached, 0),
    cached,
    output: Math.max(current.output - previous.output, 0),
    reasoning: Math.max(current.reasoning - previous.reasoning, 0),
    total: Math.max(current.total - previous.total, 0),
  };
}
function toolCategory(name: string): "shell" | "filesystem" | "search" | "mcp" | "browser" | "database" | "other" {
  const lower = name.toLowerCase();
  if (lower.includes("exec") || lower.includes("shell") || lower.includes("terminal")) return "shell";
  if (lower.includes("read") || lower.includes("file") || lower.includes("patch") || lower.includes("write")) return "filesystem";
  if (lower.includes("search") || lower.includes("grep") || lower.includes("find")) return "search";
  if (lower.includes("browser") || lower.includes("web")) return "browser";
  if (lower.includes("sql") || lower.includes("database") || lower.includes("postgres")) return "database";
  if (name.includes(".")) return "mcp";
  return "other";
}

export const codexCollector: CollectorAdapter = {
  name: "codex",
  async capability() {
    return { name: "codex", available: true, measuredUsage: true, liveWatch: true, historicalSync: true };
  },
  parseJsonLines(lines: string[], context: CollectorContext = {}): CollectorParseResult {
    const warnings: string[] = [];
    const records = lines.map((line, index) => ({ record: parseJsonLine(line), index })).filter((item) => item.record !== null) as Array<{ record: Record<string, unknown>; index: number }>;
    if (records.length < lines.filter((line) => line.trim()).length) warnings.push("One or more malformed JSONL records were skipped.");

    let sessionId = `session_${hash(lines.slice(0, 4).join("\n"))}`;
    let cliVersion: string | null = null;
    for (const { record } of records) {
      if (record.type !== "session_meta") continue;
      const payload = safeRecord(record.payload);
      sessionId = stringValue(payload?.session_id) ?? sessionId;
      cliVersion = stringValue(payload?.cli_version);
      break;
    }
    const runId = `run_codex_${sessionId}`;
    let currentTurn: MutableTurn | null = null;
    let turnIndex = 0;
    let previousUsage: TokenSnapshot | null = null;
    const events: TelemetryEventInput[] = [];
    const turns: MutableTurn[] = [];
    const firstAt = records.length ? dateValue(records[0].record.timestamp, new Date()) : new Date();
    let lastAt = firstAt;

    const ensureTurn = (at: Date): MutableTurn => {
      if (currentTurn) return currentTurn;
      currentTurn = { id: `turn_codex_${sessionId}_${turnIndex}`, index: turnIndex++, startedAt: at, endedAt: null, status: "running", model: null, reasoningEffort: null, freshInput: 0, cacheRead: 0, output: 0, reasoning: 0, toolCalls: 0 };
      turns.push(currentTurn);
      return currentTurn;
    };

    for (const { record, index } of records) {
      const at = dateValue(record.timestamp, lastAt);
      lastAt = at;
      const type = stringValue(record.type);
      const payload = safeRecord(record.payload);

      if (type === "turn_context" && payload) {
        if (currentTurn?.status === "running") { currentTurn.status = "compacted"; currentTurn.endedAt = at; }
        const turnId = stringValue(payload.turn_id) ?? `turn_codex_${sessionId}_${turnIndex}`;
        const collaboration = safeRecord(payload.collaboration_mode);
        const settings = safeRecord(collaboration?.settings);
        currentTurn = {
          id: turnId,
          index: turnIndex++,
          startedAt: at,
          endedAt: null,
          status: "running",
          model: stringValue(payload.model),
          reasoningEffort: stringValue(payload.reasoning_effort) ?? stringValue(payload.effort) ?? stringValue(settings?.reasoning_effort),
          freshInput: 0, cacheRead: 0, output: 0, reasoning: 0, toolCalls: 0,
        };
        turns.push(currentTurn);
        continue;
      }

      if (type === "event_msg" && payload?.type === "token_count") {
        const info = safeRecord(payload.info);
        const snapshot = usageSnapshot(info?.total_token_usage);
        if (!snapshot) continue;
        const increment = delta(snapshot, previousUsage);
        previousUsage = snapshot;
        const turn = ensureTurn(at);
        turn.freshInput += increment.input;
        turn.cacheRead += increment.cached;
        turn.output += increment.output;
        turn.reasoning += increment.reasoning;
        continue;
      }

      if (type === "event_msg" && payload?.type === "task_complete") {
        const turn = ensureTurn(at);
        turn.status = "completed";
        turn.endedAt = at;
        currentTurn = null;
        continue;
      }
      if (type === "event_msg" && payload?.type === "turn_aborted") {
        const turn = ensureTurn(at);
        turn.status = "aborted";
        turn.endedAt = at;
        currentTurn = null;
        continue;
      }
      if (type === "event_msg" && payload?.type === "context_compacted") {
        if (currentTurn) { currentTurn.status = "compacted"; currentTurn.endedAt = at; currentTurn = null; }
        continue;
      }

      if (type === "response_item" && payload) {
        const payloadType = stringValue(payload.type) ?? "";
        const isTool = payloadType === "custom_tool_call" || payloadType === "function_call" || payloadType === "mcp_call" || payloadType.endsWith("_call");
        if (!isTool) continue;
        const turn = ensureTurn(at);
        let name = stringValue(payload.name) ?? payloadType.replace(/_call$/, "");
        const namespace = stringValue(payload.namespace);
        if (namespace && !name.startsWith(`${namespace}.`)) name = `${namespace}.${name}`;
        const callId = stringValue(payload.call_id) ?? stringValue(payload.id) ?? `call_${hash(`${sessionId}:${index}:${name}`)}`;
        turn.toolCalls += 1;
        events.push({
          sourceEventId: sourceId(sessionId, index, `tool:${callId}`), source: "codex", eventType: "tool_call.recorded", occurredAt: at,
          projectId: context.projectId ?? null, runId,
          payload: {
            id: `tool_codex_${callId}`, runId, turnId: turn.id, parentLlmCallId: null, toolName: name, toolCategory: toolCategory(name), startedAt: at,
            endedAt: null, status: "observed", attemptIndex: 0, inputSizeBytes: null, outputSizeBytes: null, outputTokensEstimated: null, isRetry: false,
            resourceHash: null, metadata: { sourceRecordType: payloadType },
          },
        });
      }
    }

    if (currentTurn?.status === "running") currentTurn.endedAt = lastAt;
    for (const turn of turns) {
      events.push({
        sourceEventId: `codex:${sessionId}:turn:${turn.id}`, source: "codex", eventType: "turn.upsert", occurredAt: turn.endedAt ?? turn.startedAt,
        projectId: context.projectId ?? null, runId,
        payload: {
          id: turn.id, runId, turnIndex: turn.index, startedAt: turn.startedAt, endedAt: turn.endedAt, status: turn.status,
          modelRequested: turn.model, modelResolved: turn.model, reasoningEffort: turn.reasoningEffort,
          freshInputTokens: turn.freshInput, cacheReadTokens: turn.cacheRead, cacheWriteTokens: 0, reasoningTokens: turn.reasoning, outputTokens: turn.output,
          costUsd: null, toolCallCount: turn.toolCalls, retryCount: 0, fallbackCount: 0, latencyMs: turn.endedAt ? Math.max(turn.endedAt.getTime() - turn.startedAt.getTime(), 0) : null,
          timeToFirstTokenMs: null, contextTokensBefore: null, contextTokensAfter: null, contextUtilizationPct: null, usageSource: "agent_measured", metadata: {},
        },
      });
    }
    const totals = turns.reduce((total, turn) => ({
      fresh: total.fresh + turn.freshInput, cached: total.cached + turn.cacheRead, output: total.output + turn.output, reasoning: total.reasoning + turn.reasoning, tools: total.tools + turn.toolCalls,
    }), { fresh: 0, cached: 0, output: 0, reasoning: 0, tools: 0 });
    const finalStatus = turns.some((turn) => turn.status === "aborted") && turns[turns.length - 1]?.status === "aborted" ? "aborted" : turns.length && turns.every((turn) => ["completed", "compacted", "aborted"].includes(turn.status)) ? "completed" : "running";
    events.unshift({
      sourceEventId: `codex:${sessionId}:run`, source: "codex", eventType: "run.upsert", occurredAt: lastAt, projectId: context.projectId ?? null, runId,
      payload: {
        id: runId, projectId: context.projectId ?? null, environment: context.environment ?? "development", developerUserId: null, serviceAccountId: null,
        agentName: "Codex", agentVendor: "OpenAI", agentVersion: cliVersion, workflowName: null, workflowVersion: null,
        repo: context.repo ?? null, branch: context.branch ?? null, repoCommitSha: context.repoCommitSha ?? null, issueOrTicketId: null,
        startedAt: firstAt, endedAt: finalStatus === "running" ? null : lastAt, status: finalStatus, terminationReason: null,
        estimatedCostUsd: null, actualCostUsd: null, reconciledCostUsd: null, budgetLimitUsd: null,
        freshInputTokens: totals.fresh, cacheReadTokens: totals.cached, cacheWriteTokens: 0, reasoningTokens: totals.reasoning, outputTokens: totals.output,
        toolCallCount: totals.tools, retryCount: 0, fallbackCount: 0, turnCount: turns.length, finalArtifactType: null, finalArtifactReference: null, outcomeStatus: null, outcomeScore: null,
        usageSource: "agent_measured", metadata: { transcriptSessionId: sessionId, cliVersion },
      },
    });

    return {
      collector: "codex", sessionId, usageClassification: "agent_measured", events, warnings,
      measuredFields: ["fresh_input_tokens", "cache_read_tokens", "reasoning_tokens", "output_tokens", "turn_boundaries", "model", "tool_calls"],
      estimatedFields: [],
      missingFields: ["provider_actual_charge", "time_to_first_token_ms", "tool_output_tokens", "verified_outcome"],
    };
  },
};
