import { createHash } from "node:crypto";
import type { CollectorAdapter, CollectorContext, CollectorParseResult } from "@/lib/collectors/types";
import { numberValue, parseJsonLine, safeRecord, stringValue } from "@/lib/collectors/types";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function durationMs(seconds: unknown): number | null {
  const value = numberValue(seconds);
  return value === null ? null : Math.max(0, Math.round(value * 1000));
}

function usage(value: unknown) {
  const record = safeRecord(value);
  if (!record) return null;
  const input = numberValue(record.input_tokens) ?? 0;
  const cacheRead = numberValue(record.cache_read_tokens) ?? 0;
  const output = numberValue(record.output_tokens) ?? 0;
  const reasoning = numberValue(record.thinking_tokens) ?? 0;
  const total = numberValue(record.total_tokens) ?? input + output;
  const hasAny = [record.input_tokens, record.cache_read_tokens, record.output_tokens, record.thinking_tokens, record.total_tokens]
    .some((item) => typeof item === "number");
  if (!hasAny) return null;
  return {
    freshInput: Math.max(input - cacheRead, 0),
    cacheRead: Math.max(cacheRead, 0),
    reasoning: Math.max(reasoning, 0),
    output: Math.max(output, 0),
    total: Math.max(total, 0),
  };
}

function toolCategory(name: string): "shell" | "filesystem" | "search" | "mcp" | "browser" | "database" | "other" {
  const lower = name.toLowerCase();
  if (lower.includes("command") || lower.includes("shell") || lower.includes("terminal")) return "shell";
  if (lower.includes("file") || lower.includes("read") || lower.includes("write") || lower.includes("edit")) return "filesystem";
  if (lower.includes("search") || lower.includes("grep")) return "search";
  if (lower.includes("browser") || lower.includes("url") || lower.includes("web")) return "browser";
  if (lower.includes("sql") || lower.includes("database")) return "database";
  if (lower.includes("mcp") || name.includes(".")) return "mcp";
  return "other";
}

function outputByteLength(toolInfo: Record<string, unknown> | null): number | null {
  if (!toolInfo) return null;
  const output = typeof toolInfo.output === "string" ? toolInfo.output : null;
  return output === null ? null : Buffer.byteLength(output, "utf8");
}

/**
 * Parses Antigravity CLI `--output-format stream-json` output.
 *
 * Google documents `result.usage` as cumulative session usage and usage on
 * completed `step_update` records as per-step usage. Prompt/response text,
 * tool parameters, and raw tool output are intentionally discarded here.
 */
export const antigravityCollector: CollectorAdapter = {
  name: "antigravity",

  async capability() {
    return {
      name: "antigravity",
      available: true,
      measuredUsage: true,
      liveWatch: true,
      historicalSync: false,
      reason: "Antigravity CLI stream-json exposes documented per-step and cumulative token usage. Generic IDE transcript stores are not treated as measured unless the same usage fields are present.",
    };
  },

  parseJsonLines(lines: string[], context: CollectorContext = {}): CollectorParseResult {
    const records = lines
      .map((line, index) => ({ index, record: parseJsonLine(line) }))
      .filter((item): item is { index: number; record: Record<string, unknown> } => Boolean(item.record));

    const warnings: string[] = [];
    if (records.length < lines.filter((line) => line.trim()).length) warnings.push("One or more malformed Antigravity stream records were skipped.");

    let sessionId: string | null = null;
    let model: string | null = null;
    let agent: string | null = null;
    let cwd: string | null = null;
    let status: "completed" | "failed" | "aborted" = "completed";
    let terminationReason: string | null = null;
    let finalUsage: ReturnType<typeof usage> = null;
    let finalDurationMs: number | null = null;
    let finalTurnCount = 0;
    let toolCount = 0;
    let turnCount = 0;
    const events: TelemetryEventInput[] = [];
    const observedAt = new Date();

    for (const { index, record } of records) {
      const eventName = stringValue(record.event);
      if (eventName === "init") {
        sessionId = stringValue(record.conversation_id) ?? sessionId;
        const init = safeRecord(record.init);
        model = stringValue(init?.model) ?? model;
        agent = stringValue(init?.agent) ?? agent;
        cwd = stringValue(init?.cwd) ?? cwd;
        continue;
      }

      if (eventName === "step_update") {
        const step = safeRecord(record.step_update);
        if (!step) continue;
        sessionId = stringValue(step.conversation_id) ?? sessionId;
        if (stringValue(step.state) !== "DONE") continue;
        const stepIndex = numberValue(step.step_index) ?? index;
        const stepType = stringValue(step.step_type) ?? "unknown";
        const stepUsage = usage(step.usage);
        const stepDuration = durationMs(step.duration_seconds);

        if (stepType === "tool") {
          const toolInfo = safeRecord(step.tool_info);
          const toolName = stringValue(step.tool_name) ?? stringValue(toolInfo?.name) ?? "unknown_tool";
          const error = safeRecord(toolInfo?.error);
          const toolId = `tool_antigravity_${sessionId ?? "unknown"}_${stepIndex}`;
          toolCount += 1;
          events.push({
            sourceEventId: `antigravity:${sessionId ?? "unknown"}:step:${stepIndex}:tool`,
            source: "antigravity",
            eventType: "tool_call.recorded",
            occurredAt: observedAt,
            projectId: context.projectId ?? null,
            runId: `run_antigravity_${sessionId ?? hash(lines.slice(0, 8).join("\n"))}`,
            payload: {
              id: toolId,
              runId: `run_antigravity_${sessionId ?? hash(lines.slice(0, 8).join("\n"))}`,
              turnId: null,
              parentLlmCallId: null,
              toolName,
              toolCategory: toolCategory(toolName),
              startedAt: observedAt,
              endedAt: observedAt,
              status: error ? "failed" : "completed",
              attemptIndex: 0,
              inputSizeBytes: null,
              outputSizeBytes: outputByteLength(toolInfo),
              outputTokensEstimated: null,
              isRetry: false,
              resourceHash: null,
              metadata: {
                source: "antigravity_stream_json",
                stepIndex,
                durationMs: stepDuration,
                errorType: stringValue(error?.type),
                rawContentStored: false,
              },
            },
          });
          continue;
        }

        if (stepUsage && (stepType === "agent_response" || stepType === "checkpoint")) {
          const turnId = `turn_antigravity_${sessionId ?? "unknown"}_${stepIndex}`;
          const callId = `llm_antigravity_${sessionId ?? "unknown"}_${stepIndex}`;
          const runId = `run_antigravity_${sessionId ?? hash(lines.slice(0, 8).join("\n"))}`;
          turnCount += stepType === "agent_response" ? 1 : 0;
          events.push({
            sourceEventId: `antigravity:${sessionId ?? "unknown"}:step:${stepIndex}:turn`,
            source: "antigravity",
            eventType: "turn.upsert",
            occurredAt: observedAt,
            projectId: context.projectId ?? null,
            runId,
            payload: {
              id: turnId,
              runId,
              turnIndex: stepIndex,
              startedAt: observedAt,
              endedAt: observedAt,
              status: "completed",
              modelRequested: model,
              modelResolved: model,
              reasoningEffort: null,
              freshInputTokens: stepUsage.freshInput,
              cacheReadTokens: stepUsage.cacheRead,
              cacheWriteTokens: 0,
              reasoningTokens: stepUsage.reasoning,
              outputTokens: stepUsage.output,
              costUsd: null,
              toolCallCount: 0,
              retryCount: 0,
              fallbackCount: 0,
              latencyMs: stepDuration,
              timeToFirstTokenMs: null,
              contextTokensBefore: null,
              contextTokensAfter: null,
              contextUtilizationPct: null,
              usageSource: "agent_measured",
              metadata: { source: "antigravity_stream_json", stepType },
            },
          });
          events.push({
            sourceEventId: `antigravity:${sessionId ?? "unknown"}:step:${stepIndex}:llm`,
            source: "antigravity",
            eventType: "llm_call.recorded",
            occurredAt: observedAt,
            projectId: context.projectId ?? null,
            runId,
            payload: {
              id: callId,
              runId,
              turnId,
              provider: "Google",
              modelRequested: model,
              modelResolved: model,
              providerRequestId: null,
              freshInputTokens: stepUsage.freshInput,
              cacheReadTokens: stepUsage.cacheRead,
              cacheWriteTokens: 0,
              audioInputTokens: null,
              imageInputUnits: null,
              searchUnits: null,
              reasoningTokens: stepUsage.reasoning,
              outputTokens: stepUsage.output,
              costUsd: null,
              costSource: "agent_measured",
              pricingVersion: null,
              serviceTier: null,
              latencyMs: stepDuration,
              timeToFirstTokenMs: null,
              statusCode: null,
              attemptIndex: 0,
              fallbackFromCallId: null,
              startedAt: observedAt,
              endedAt: observedAt,
              metadata: { source: "antigravity_stream_json", stepType },
            },
          });
        }
        continue;
      }

      if (eventName === "result") {
        const result = safeRecord(record.result);
        if (!result) continue;
        sessionId = stringValue(result.conversation_id) ?? sessionId;
        finalUsage = usage(result.usage) ?? finalUsage;
        finalDurationMs = durationMs(result.duration_seconds) ?? finalDurationMs;
        finalTurnCount = numberValue(result.num_turns) ?? finalTurnCount;
        const rawStatus = stringValue(result.status)?.toUpperCase();
        if (rawStatus === "ERROR") {
          status = "failed";
          terminationReason = stringValue(result.error) ? "antigravity_reported_error" : "antigravity_error";
        } else if (rawStatus && rawStatus !== "SUCCESS") {
          status = "aborted";
          terminationReason = `antigravity_${rawStatus.toLowerCase()}`;
        }
      }
    }

    sessionId ??= `session_${hash(lines.slice(0, 8).join("\n"))}`;
    const runId = `run_antigravity_${sessionId}`;

    // Patch run IDs in events created before the init/result record supplied a conversation ID.
    for (const event of events) {
      event.runId = runId;
      event.payload.runId = runId;
      if (event.eventType === "turn.upsert" || event.eventType === "llm_call.recorded") {
        const suffix = String((event.payload.id as string).split("_").at(-1) ?? "0");
        const turnId = `turn_antigravity_${sessionId}_${suffix}`;
        if (event.eventType === "turn.upsert") event.payload.id = turnId;
        if (event.eventType === "llm_call.recorded") {
          event.payload.id = `llm_antigravity_${sessionId}_${suffix}`;
          event.payload.turnId = turnId;
        }
      }
      if (event.eventType === "tool_call.recorded") {
        const suffix = String((event.payload.id as string).split("_").at(-1) ?? "0");
        event.payload.id = `tool_antigravity_${sessionId}_${suffix}`;
      }
    }

    const totals = finalUsage ?? { freshInput: 0, cacheRead: 0, reasoning: 0, output: 0, total: 0 };
    events.unshift({
      sourceEventId: `antigravity:${sessionId}:run`,
      source: "antigravity",
      eventType: "run.upsert",
      occurredAt: observedAt,
      projectId: context.projectId ?? null,
      runId,
      payload: {
        id: runId,
        projectId: context.projectId ?? null,
        environment: context.environment ?? "development",
        developerUserId: null,
        serviceAccountId: null,
        agentName: agent ?? "Google Antigravity",
        agentVendor: "Google",
        agentVersion: null,
        workflowName: "antigravity-cli",
        workflowVersion: null,
        repo: context.repo ?? cwd ?? null,
        branch: context.branch ?? null,
        repoCommitSha: context.repoCommitSha ?? null,
        issueOrTicketId: null,
        startedAt: observedAt,
        endedAt: observedAt,
        status,
        terminationReason,
        estimatedCostUsd: null,
        actualCostUsd: null,
        reconciledCostUsd: null,
        budgetLimitUsd: null,
        freshInputTokens: totals.freshInput,
        cacheReadTokens: totals.cacheRead,
        cacheWriteTokens: 0,
        reasoningTokens: totals.reasoning,
        outputTokens: totals.output,
        toolCallCount: toolCount,
        retryCount: 0,
        fallbackCount: 0,
        turnCount: finalTurnCount || turnCount,
        finalArtifactType: null,
        finalArtifactReference: null,
        outcomeStatus: null,
        outcomeScore: null,
        usageSource: "agent_measured",
        metadata: {
          source: "antigravity_stream_json",
          durationMs: finalDurationMs,
          totalTokensReported: totals.total,
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolOutputStored: false,
        },
      },
    });

    if (!finalUsage) warnings.push("No terminal Antigravity result.usage record was found; run totals may be incomplete.");

    return {
      collector: "antigravity",
      sessionId,
      usageClassification: "agent_measured",
      events,
      warnings,
      measuredFields: ["input_tokens", "cache_read_tokens", "thinking_tokens", "output_tokens", "total_tokens", "duration", "tool steps", "conversation_id"],
      estimatedFields: [],
      missingFields: ["provider_actual_charge", "cache_write_tokens", "verified_outcome"],
    };
  },
};
