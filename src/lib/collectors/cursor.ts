import { createHash } from "node:crypto";
import type { CollectorAdapter, CollectorContext, CollectorParseResult } from "@/lib/collectors/types";
import { numberValue, parseJsonLine, safeRecord, stringValue } from "@/lib/collectors/types";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

function hash(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 32); }
function timestamp(value: unknown, fallback: Date): Date {
  const raw = stringValue(value);
  const parsed = raw ? new Date(raw) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
function localChars(record: Record<string, unknown>): number {
  let chars = 0;
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || value === null || value === undefined) return;
    if (typeof value === "string") { chars += value.length; return; }
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
    const object = safeRecord(value);
    if (!object) return;
    for (const [key, child] of Object.entries(object)) {
      if (["content", "text", "output", "result", "body", "code", "message"].includes(key.toLowerCase())) visit(child, depth + 1);
    }
  };
  visit(record, 0);
  return chars;
}
function category(name: string): "shell" | "filesystem" | "search" | "mcp" | "browser" | "database" | "other" {
  const v = name.toLowerCase();
  if (v.includes("terminal") || v.includes("shell") || v.includes("command")) return "shell";
  if (v.includes("file") || v.includes("read") || v.includes("edit") || v.includes("write")) return "filesystem";
  if (v.includes("search") || v.includes("grep")) return "search";
  if (v.includes("browser") || v.includes("web")) return "browser";
  if (v.includes("database") || v.includes("sql")) return "database";
  if (v.includes("mcp") || name.includes(".")) return "mcp";
  return "other";
}

export const cursorCollector: CollectorAdapter = {
  name: "cursor",
  async capability() {
    return {
      name: "cursor", available: true, measuredUsage: false, liveWatch: false, historicalSync: true,
      reason: "Cursor session artifacts may expose actions/context but do not consistently expose provider-billed token usage. Local estimates stay separate from measured aggregates.",
    };
  },
  parseJsonLines(lines: string[], context: CollectorContext = {}): CollectorParseResult {
    const records = lines.map((line, index) => ({ record: parseJsonLine(line), index })).filter((item) => item.record) as Array<{ record: Record<string, unknown>; index: number }>;
    const warnings = records.length < lines.filter((line) => line.trim()).length ? ["One or more malformed records were skipped."] : [];
    warnings.push("Token usage is estimated locally for Cursor unless a future stable transcript field supplies measured usage.");
    const sessionId = records.map(({ record }) => stringValue(record.sessionId) ?? stringValue(record.session_id) ?? stringValue(record.conversationId)).find(Boolean) ?? `session_${hash(lines.slice(0, 8).join("\n"))}`;
    const runId = `run_cursor_${sessionId}`;
    const firstAt = records[0] ? timestamp(records[0].record.timestamp ?? records[0].record.createdAt, new Date()) : new Date();
    let lastAt = firstAt;
    let estimatedInputTokens = 0;
    let outputTokensEstimate = 0;
    let toolCount = 0;
    const events: TelemetryEventInput[] = [];
    const resourceReads = new Map<string, { tokens: number; count: number }>();

    for (const { record, index } of records) {
      lastAt = timestamp(record.timestamp ?? record.createdAt, lastAt);
      const type = stringValue(record.type) ?? stringValue(record.kind) ?? "unknown";
      const sizeBytes = numberValue(record.sizeBytes) ?? numberValue(record.bytes) ?? null;
      const chars = localChars(record);
      const estimatedTokens = Math.max(0, Math.ceil((sizeBytes ?? chars) / 4));
      const lower = type.toLowerCase();
      const looksLikeRead = lower.includes("read") || lower.includes("file") || lower.includes("context") || lower.includes("search");
      const looksLikeAssistant = lower.includes("assistant") || lower.includes("response");
      if (looksLikeRead) estimatedInputTokens += estimatedTokens;
      if (looksLikeAssistant) outputTokensEstimate += estimatedTokens;

      const resource = stringValue(record.path) ?? stringValue(record.filePath) ?? stringValue(record.uri);
      if (looksLikeRead && resource) {
        const resourceHash = hash(resource);
        const previous = resourceReads.get(resourceHash) ?? { tokens: 0, count: 0 };
        resourceReads.set(resourceHash, { tokens: previous.tokens + estimatedTokens, count: previous.count + 1 });
        const toolId = `tool_cursor_${sessionId}_${index}`;
        toolCount += 1;
        events.push({
          sourceEventId: `cursor:${sessionId}:${index}:resource`, source: "cursor", eventType: "tool_call.recorded", occurredAt: lastAt,
          projectId: context.projectId ?? null, runId,
          payload: {
            id: toolId, runId, turnId: null, parentLlmCallId: null, toolName: type, toolCategory: category(type), startedAt: lastAt, endedAt: lastAt,
            status: "observed", attemptIndex: 0, inputSizeBytes: null, outputSizeBytes: sizeBytes ?? (chars || null), outputTokensEstimated: estimatedTokens || null,
            isRetry: false, resourceHash, metadata: { usagePrecision: "estimated" },
          },
        });
      }
    }

    events.unshift({
      sourceEventId: `cursor:${sessionId}:run`, source: "cursor", eventType: "run.upsert", occurredAt: lastAt, projectId: context.projectId ?? null, runId,
      payload: {
        id: runId, projectId: context.projectId ?? null, environment: context.environment ?? "development", developerUserId: null, serviceAccountId: null,
        agentName: "Cursor", agentVendor: "Cursor", agentVersion: null, workflowName: null, workflowVersion: null, repo: context.repo ?? null, branch: context.branch ?? null,
        repoCommitSha: context.repoCommitSha ?? null, issueOrTicketId: null, startedAt: firstAt, endedAt: lastAt, status: "completed", terminationReason: null,
        estimatedCostUsd: null, actualCostUsd: null, reconciledCostUsd: null, budgetLimitUsd: null,
        freshInputTokens: estimatedInputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, outputTokens: outputTokensEstimate,
        toolCallCount: toolCount, retryCount: 0, fallbackCount: 0, turnCount: 0, finalArtifactType: null, finalArtifactReference: null, outcomeStatus: null, outcomeScore: null,
        usageSource: "estimated", metadata: { charsPerTokenHeuristic: 4, repeatedResourceCount: [...resourceReads.values()].filter((item) => item.count > 1).length },
      },
    });

    return {
      collector: "cursor", sessionId, usageClassification: "estimated", events, warnings,
      measuredFields: ["session/action metadata where present", "resource identifiers where present"],
      estimatedFields: ["fresh_input_tokens", "output_tokens", "tool_output_tokens"],
      missingFields: ["provider_billed_tokens", "cache_usage", "reasoning_tokens", "provider_actual_charge", "verified_outcome"],
    };
  },
};
