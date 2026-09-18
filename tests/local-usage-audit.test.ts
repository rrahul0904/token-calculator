import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CollectorParseResult } from "@/lib/collectors/types";
import { auditCollectorResult, formatLocalUsageAuditReport } from "@/lib/optimization/local-usage-audit";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

const at = new Date("2026-09-16T05:00:00.000Z");

function event(eventType: TelemetryEventInput["eventType"], sourceEventId: string, payload: Record<string, unknown>, runId = "run-audit-001"): TelemetryEventInput {
  return { sourceEventId, source: "codex", eventType, occurredAt: at, runId, payload };
}

function fixture(): CollectorParseResult {
  return {
    collector: "codex",
    sessionId: "session-audit-001",
    usageClassification: "agent_measured",
    warnings: ["fixture warning"],
    measuredFields: ["reasoningTokens", "outputTokens"],
    estimatedFields: ["toolOutputTokens"],
    missingFields: [],
    events: [
      event("run.upsert", "run", {
        id: "run-audit-001",
        status: "completed",
        actualCostUsd: 1.25,
        outcomeStatus: "completed",
        freshInputTokens: 22_000,
        cacheReadTokens: 1_000,
        cacheWriteTokens: 12_000,
        reasoningTokens: 7_000,
        outputTokens: 2_000,
      }),
      event("turn.upsert", "turn-1", {
        id: "turn-audit-001",
        runId: "run-audit-001",
        turnIndex: 0,
        status: "completed",
        modelResolved: "reasoning-model",
        reasoningEffort: "high",
        freshInputTokens: 2_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 6_000,
        reasoningTokens: 6_000,
        outputTokens: 500,
        costUsd: 0.5,
        contextTokensBefore: 5_000,
        contextTokensAfter: 20_000,
      }),
      event("turn.upsert", "turn-2", {
        id: "turn-audit-002",
        runId: "run-audit-001",
        turnIndex: 1,
        status: "completed",
        modelResolved: "reasoning-model",
        reasoningEffort: "medium",
        freshInputTokens: 20_000,
        cacheReadTokens: 1_000,
        cacheWriteTokens: 6_000,
        reasoningTokens: 1_000,
        outputTokens: 1_500,
        costUsd: 0.75,
        contextTokensBefore: 20_000,
        contextTokensAfter: 40_000,
      }),
      event("tool_call.recorded", "tool-1", {
        id: "tool-audit-001",
        runId: "run-audit-001",
        turnId: "turn-audit-001",
        toolName: "read_file",
        toolCategory: "filesystem",
        status: "completed",
        outputTokensEstimated: 1_000,
        resourceHash: "resource-stable-hash",
        operation: "read",
      }),
      event("tool_call.recorded", "tool-2", {
        id: "tool-audit-002",
        runId: "run-audit-001",
        turnId: "turn-audit-002",
        toolName: "read_file",
        toolCategory: "filesystem",
        status: "completed",
        outputTokensEstimated: 1_200,
        resourceHash: "resource-stable-hash",
        operation: "read",
      }),
      event("tool_call.recorded", "tool-3", {
        id: "tool-audit-003",
        runId: "run-audit-001",
        turnId: "turn-audit-002",
        toolName: "search",
        toolCategory: "search",
        status: "completed",
        outputTokensEstimated: 9_000,
        resourceHash: "search-result-hash",
        operation: "search",
      }),
      event("llm_call.recorded", "llm-1", {
        id: "llm-audit-001",
        runId: "run-audit-001",
        provider: "openai",
        modelResolved: "primary-model",
        costUsd: 0.4,
        attemptIndex: 0,
      }),
      event("llm_call.recorded", "llm-2", {
        id: "llm-audit-002",
        runId: "run-audit-001",
        provider: "openai",
        modelResolved: "fallback-model",
        costUsd: 0.25,
        attemptIndex: 1,
        fallbackFromCallId: "llm-audit-001",
      }),
      event("outcome.recorded", "outcome", { runId: "run-audit-001", status: "completed", taskCompleted: true }),
    ],
  };
}

describe("local usage audit", () => {
  it("turns normalized local telemetry into privacy-safe optimization recommendations", () => {
    const report = auditCollectorResult(fixture(), { generatedAt: "2026-09-16T05:10:00.000Z" });

    expect(report.generatedAt).toBe("2026-09-16T05:10:00.000Z");
    expect(report.privacy).toEqual({ localOnly: true, contentStored: false, rawPromptContentInspected: false, networkRequestsRequired: false });
    expect(report.summary).toMatchObject({
      runs: 1,
      turns: 2,
      llmCalls: 2,
      toolCalls: 3,
      freshInputTokens: 22_000,
      cacheReadTokens: 1_000,
      cacheWriteTokens: 12_000,
      reasoningTokens: 7_000,
      outputTokens: 2_000,
      knownCostUsd: 1.25,
    });

    expect(report.recommendations.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining([
      "repeated-resource-read",
      "oversized-tool-output",
      "cache-blind-spot",
      "fallback-premium",
      "reasoning-review-candidate",
    ]));
    expect(report.recommendations.find((finding) => finding.ruleId === "reasoning-review-candidate")?.evidence).toMatchObject({ semanticTaskComplexityInferred: false });
    expect(report.opportunity).toMatchObject({
      largestSingleFindingWasteTokens: 9_000,
      largestSingleFindingWasteUsd: 0.25,
      additiveSavingsClaimed: false,
    });
    expect(report.warnings).toContain("fixture warning");
  });

  it("renders a human report without turning overlapping findings into an additive savings claim", () => {
    const text = formatLocalUsageAuditReport(auditCollectorResult(fixture(), { generatedAt: "2026-09-16T05:10:00.000Z" }));
    expect(text).toContain("Token Intelligence local usage audit");
    expect(text).toContain("local-only analysis of normalized metadata");
    expect(text).toContain("Largest single token opportunity: 9,000");
    expect(text).toContain("does not add them into a headline savings total");
    expect(text).toContain("High reasoning spend is a benchmark candidate");
  });

  it("executes the real CLI audit path offline against a provider-format trace", () => {
    const tsxBinary = resolve(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
    const stdout = execFileSync(
      tsxBinary,
      ["scripts/ti.ts", "audit", "codex", "tests/fixtures/codex-local-audit.jsonl", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          TOKEN_INTELLIGENCE_API_KEY: "",
          TOKEN_INTELLIGENCE_BASE_URL: "http://127.0.0.1:1",
        },
      },
    );
    const report = JSON.parse(stdout) as ReturnType<typeof auditCollectorResult>;

    expect(report.source).toBe("codex");
    expect(report.sessionId).toBe("codex-local-audit-fixture");
    expect(report.summary).toMatchObject({ runs: 1, turns: 1, reasoningTokens: 6_000 });
    expect(report.privacy).toEqual({ localOnly: true, contentStored: false, rawPromptContentInspected: false, networkRequestsRequired: false });
    expect(report.recommendations.some((finding) => finding.ruleId === "reasoning-review-candidate")).toBe(true);
  });
});