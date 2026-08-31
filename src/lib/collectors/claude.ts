import { createHash } from "node:crypto";
import type { CollectorAdapter, CollectorContext, CollectorParseResult } from "@/lib/collectors/types";
import { numberValue, parseJsonLine, safeRecord, stringValue } from "@/lib/collectors/types";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

interface MutableClaudeTurn {
  id: string;
  index: number;
  startedAt: Date;
  endedAt: Date | null;
  status: "running" | "completed" | "aborted" | "failed";
  model: string | null;
  freshInput: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  output: number;
  toolCalls: number;
  llmCalls: number;
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 32); }
function at(value: unknown, fallback: Date): Date {
  const raw = stringValue(value);
  const parsed = raw ? new Date(raw) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
function cacheCreation(usage: Record<string, unknown>): { five: number; oneHour: number } {
  const nested = safeRecord(usage.cache_creation);
  if (nested) {
    return {
      five: Math.max(0, numberValue(nested.ephemeral_5m_input_tokens) ?? 0),
      oneHour: Math.max(0, numberValue(nested.ephemeral_1h_input_tokens) ?? 0),
    };
  }
  return { five: Math.max(0, numberValue(usage.cache_creation_input_tokens) ?? 0), oneHour: 0 };
}
function toolCategory(name: string): "shell" | "filesystem" | "search" | "mcp" | "browser" | "database" | "other" {
  const value = name.toLowerCase();
  if (value.includes("bash") || value.includes("shell") || value.includes("terminal")) return "shell";
  if (value.includes("read") || value.includes("write") || value.includes("edit") || value.includes("file")) return "filesystem";
  if (value.includes("grep") || value.includes("glob") || value.includes("search")) return "search";
  if (value.includes("browser") || value.includes("web")) return "browser";
  if (value.includes("sql") || value.includes("database") || value.includes("postgres")) return "database";
  if (value.includes("mcp") || name.includes(".")) return "mcp";
  return "other";
}

export const claudeCollector: CollectorAdapter = {
  name: "claude",
  async capability() { return { name: "claude", available: true, measuredUsage: true, liveWatch: true, historicalSync: true }; },
  parseJsonLines(lines: string[], context: CollectorContext = {}): CollectorParseResult {
    const warnings: string[] = [];
    const parsedLines = lines.map((line, index) => ({ record: parseJsonLine(line), index })).filter((item) => item.record) as Array<{ record: Record<string, unknown>; index: number }>;
    if (parsedLines.length < lines.filter((line) => line.trim()).length) warnings.push("One or more malformed JSONL records were skipped.");

    const firstRecord = parsedLines[0]?.record;
    const explicitSession = parsedLines.map(({ record }) => stringValue(record.sessionId)).find(Boolean) ?? null;
    const sessionId = explicitSession ?? `session_${hash(lines.slice(0, 4).join("\n"))}`;
    const runId = `run_claude_${sessionId}`;
    const firstAt = firstRecord ? at(firstRecord.timestamp, new Date()) : new Date();
    let lastAt = firstAt;
    let index = 0;
    let current: MutableClaudeTurn | null = null;
    const turns: MutableClaudeTurn[] = [];
    const events: TelemetryEventInput[] = [];
    const seenUuids = new Set<string>();
    const seenUsage = new Set<string>();
    const seenTools = new Set<string>();
    let cliVersion: string | null = null;

    const newTurn = (timestamp: Date, explicitId?: string | null): MutableClaudeTurn => {
      if (current?.status === "running") { current.status = "completed"; current.endedAt = timestamp; }
      current = {
        id: explicitId ?? `turn_claude_${sessionId}_${index}`,
        index: index++, startedAt: timestamp, endedAt: null, status: "running", model: null,
        freshInput: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, output: 0, toolCalls: 0, llmCalls: 0,
      };
      turns.push(current);
      return current;
    };
    const ensureTurn = (timestamp: Date): MutableClaudeTurn => current ?? newTurn(timestamp);

    for (const { record, index: lineIndex } of parsedLines) {
      const timestamp = at(record.timestamp, lastAt);
      lastAt = timestamp;
      cliVersion = cliVersion ?? stringValue(record.version) ?? stringValue(record.claudeCodeVersion);
      const uuid = stringValue(record.uuid);
      if (uuid) {
        if (seenUuids.has(uuid)) continue;
        seenUuids.add(uuid);
      }
      if (record.isSidechain === true) continue;
      const type = stringValue(record.type);

      if (type === "user") {
        newTurn(timestamp, uuid ? `turn_claude_${uuid}` : null);
        continue;
      }
      if (type !== "assistant") continue;

      const message = safeRecord(record.message);
      if (!message) continue;
      const model = stringValue(message.model);
      const messageId = stringValue(message.id);
      const requestId = stringValue(record.requestId);
      const stopReason = stringValue(message.stop_reason);
      const turn = ensureTurn(timestamp);
      if (model) turn.model = model;

      const usage = safeRecord(message.usage);
      const usageDedup = messageId && requestId ? `${messageId}|${requestId}` : uuid ?? null;
      if (usage && (!usageDedup || !seenUsage.has(usageDedup))) {
        if (usageDedup) seenUsage.add(usageDedup);
        const freshInput = Math.max(0, numberValue(usage.input_tokens) ?? 0);
        const cacheRead = Math.max(0, numberValue(usage.cache_read_input_tokens) ?? 0);
        const cache = cacheCreation(usage);
        const output = Math.max(0, numberValue(usage.output_tokens) ?? 0);
        const hasUsage = [usage.input_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens, usage.output_tokens].some((value) => typeof value === "number") || safeRecord(usage.cache_creation) !== null;
        if (hasUsage) {
          turn.freshInput += freshInput;
          turn.cacheRead += cacheRead;
          turn.cacheWrite5m += cache.five;
          turn.cacheWrite1h += cache.oneHour;
          turn.output += output;
          turn.llmCalls += 1;
          const callId = `llm_claude_${messageId ?? uuid ?? hash(`${sessionId}:${lineIndex}`)}`;
          events.push({
            sourceEventId: `claude:${sessionId}:${usageDedup ?? lineIndex}:usage`, source: "claude", eventType: "llm_call.recorded", occurredAt: timestamp,
            projectId: context.projectId ?? null, runId,
            payload: {
              id: callId, runId, turnId: turn.id, provider: "Anthropic", modelRequested: model, modelResolved: model, providerRequestId: requestId,
              freshInputTokens: freshInput, cacheReadTokens: cacheRead, cacheWriteTokens: cache.five + cache.oneHour, audioInputTokens: null, imageInputUnits: null,
              searchUnits: null, reasoningTokens: null, outputTokens: output, costUsd: null, costSource: "agent_measured", pricingVersion: null,
              serviceTier: stringValue(usage.service_tier), latencyMs: null, timeToFirstTokenMs: null, statusCode: null, attemptIndex: 0, fallbackFromCallId: null,
              startedAt: timestamp, endedAt: timestamp, metadata: { cacheWrite5mTokens: cache.five, cacheWrite1hTokens: cache.oneHour },
            },
          });

          const iterations = Array.isArray(usage.iterations) ? usage.iterations : [];
          for (let advisorIndex = 0; advisorIndex < iterations.length; advisorIndex++) {
            const advisor = safeRecord(iterations[advisorIndex]);
            if (!advisor || advisor.type !== "advisor_message") continue;
            const advisorModel = stringValue(advisor.model);
            if (!advisorModel) continue;
            const advisorCache = cacheCreation(advisor);
            const advisorInput = Math.max(0, numberValue(advisor.input_tokens) ?? 0);
            const advisorRead = Math.max(0, numberValue(advisor.cache_read_input_tokens) ?? 0);
            const advisorOutput = Math.max(0, numberValue(advisor.output_tokens) ?? 0);
            turn.freshInput += advisorInput;
            turn.cacheRead += advisorRead;
            turn.cacheWrite5m += advisorCache.five;
            turn.cacheWrite1h += advisorCache.oneHour;
            turn.output += advisorOutput;
            turn.llmCalls += 1;
            events.push({
              sourceEventId: `claude:${sessionId}:${usageDedup ?? lineIndex}:advisor:${advisorIndex}`, source: "claude", eventType: "llm_call.recorded", occurredAt: timestamp,
              projectId: context.projectId ?? null, runId,
              payload: {
                id: `llm_claude_advisor_${hash(`${usageDedup}:${advisorIndex}`)}`, runId, turnId: turn.id, provider: "Anthropic", modelRequested: advisorModel, modelResolved: advisorModel,
                providerRequestId: null, freshInputTokens: advisorInput, cacheReadTokens: advisorRead, cacheWriteTokens: advisorCache.five + advisorCache.oneHour,
                audioInputTokens: null, imageInputUnits: null, searchUnits: null, reasoningTokens: null, outputTokens: advisorOutput, costUsd: null,
                costSource: "agent_measured", pricingVersion: null, serviceTier: null, latencyMs: null, timeToFirstTokenMs: null, statusCode: null,
                attemptIndex: 0, fallbackFromCallId: null, startedAt: timestamp, endedAt: timestamp, metadata: { role: "advisor", cacheWrite5mTokens: advisorCache.five, cacheWrite1hTokens: advisorCache.oneHour },
              },
            });
          }
        }
      }

      const content = Array.isArray(message.content) ? message.content : [];
      for (const item of content) {
        const block = safeRecord(item);
        if (!block || block.type !== "tool_use") continue;
        const name = stringValue(block.name);
        if (!name) continue;
        const toolId = stringValue(block.id) ?? `tool_${hash(`${sessionId}:${lineIndex}:${name}`)}`;
        if (seenTools.has(toolId)) continue;
        seenTools.add(toolId);
        turn.toolCalls += 1;
        const inputBytes = block.input === undefined ? null : Buffer.byteLength(JSON.stringify(block.input), "utf8");
        events.push({
          sourceEventId: `claude:${sessionId}:tool:${toolId}`, source: "claude", eventType: "tool_call.recorded", occurredAt: timestamp,
          projectId: context.projectId ?? null, runId,
          payload: {
            id: `tool_claude_${toolId}`, runId, turnId: turn.id, parentLlmCallId: null, toolName: name, toolCategory: toolCategory(name), startedAt: timestamp,
            endedAt: null, status: "observed", attemptIndex: 0, inputSizeBytes: inputBytes, outputSizeBytes: null, outputTokensEstimated: null, isRetry: false,
            resourceHash: null, metadata: {},
          },
        });
      }

      if (stopReason && stopReason !== "tool_use") {
        turn.status = stopReason === "error" ? "failed" : "completed";
        turn.endedAt = timestamp;
        current = null;
      }
    }

    const lastTurn = turns.at(-1);
    if (lastTurn?.status === "running") lastTurn.endedAt = lastAt;
    for (const turn of turns) {
      events.push({
        sourceEventId: `claude:${sessionId}:turn:${turn.id}`, source: "claude", eventType: "turn.upsert", occurredAt: turn.endedAt ?? turn.startedAt,
        projectId: context.projectId ?? null, runId,
        payload: {
          id: turn.id, runId, turnIndex: turn.index, startedAt: turn.startedAt, endedAt: turn.endedAt, status: turn.status,
          modelRequested: turn.model, modelResolved: turn.model, reasoningEffort: null, freshInputTokens: turn.freshInput, cacheReadTokens: turn.cacheRead,
          cacheWriteTokens: turn.cacheWrite5m + turn.cacheWrite1h, reasoningTokens: 0, outputTokens: turn.output, costUsd: null, toolCallCount: turn.toolCalls,
          retryCount: 0, fallbackCount: 0, latencyMs: turn.endedAt ? Math.max(0, turn.endedAt.getTime() - turn.startedAt.getTime()) : null,
          timeToFirstTokenMs: null, contextTokensBefore: null, contextTokensAfter: null, contextUtilizationPct: null, usageSource: "agent_measured",
          metadata: { cacheWrite5mTokens: turn.cacheWrite5m, cacheWrite1hTokens: turn.cacheWrite1h, llmCalls: turn.llmCalls },
        },
      });
    }

    const totals = turns.reduce((acc, turn) => ({ fresh: acc.fresh + turn.freshInput, read: acc.read + turn.cacheRead, write5: acc.write5 + turn.cacheWrite5m, write1: acc.write1 + turn.cacheWrite1h, output: acc.output + turn.output, tools: acc.tools + turn.toolCalls }), { fresh: 0, read: 0, write5: 0, write1: 0, output: 0, tools: 0 });
    const finalStatus = turns.length && turns.every((turn) => turn.status !== "running") ? (turns.some((turn) => turn.status === "failed") ? "failed" : "completed") : "running";
    events.unshift({
      sourceEventId: `claude:${sessionId}:run`, source: "claude", eventType: "run.upsert", occurredAt: lastAt, projectId: context.projectId ?? null, runId,
      payload: {
        id: runId, projectId: context.projectId ?? null, environment: context.environment ?? "development", developerUserId: null, serviceAccountId: null,
        agentName: "Claude Code", agentVendor: "Anthropic", agentVersion: cliVersion, workflowName: null, workflowVersion: null, repo: context.repo ?? null,
        branch: context.branch ?? null, repoCommitSha: context.repoCommitSha ?? null, issueOrTicketId: null, startedAt: firstAt, endedAt: finalStatus === "running" ? null : lastAt,
        status: finalStatus, terminationReason: null, estimatedCostUsd: null, actualCostUsd: null, reconciledCostUsd: null, budgetLimitUsd: null,
        freshInputTokens: totals.fresh, cacheReadTokens: totals.read, cacheWriteTokens: totals.write5 + totals.write1, reasoningTokens: 0, outputTokens: totals.output,
        toolCallCount: totals.tools, retryCount: 0, fallbackCount: 0, turnCount: turns.length, finalArtifactType: null, finalArtifactReference: null,
        outcomeStatus: null, outcomeScore: null, usageSource: "agent_measured", metadata: { transcriptSessionId: sessionId, cacheWrite5mTokens: totals.write5, cacheWrite1hTokens: totals.write1 },
      },
    });

    return {
      collector: "claude", sessionId, usageClassification: "agent_measured", events, warnings,
      measuredFields: ["fresh_input_tokens", "cache_read_tokens", "cache_write_tokens", "output_tokens", "model", "tool_calls"],
      estimatedFields: [],
      missingFields: ["reasoning_tokens", "provider_actual_charge", "time_to_first_token_ms", "verified_outcome"],
    };
  },
};
