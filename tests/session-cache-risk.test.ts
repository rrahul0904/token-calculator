import { describe, expect, it } from "vitest";
import { claudeCollector } from "@/lib/collectors/claude";
import {
  deriveSessionCacheRiskFromCollector,
  evaluateSessionCacheRisk,
} from "@/lib/optimization/session-cache-risk";

function baseInput(overrides: Partial<Parameters<typeof evaluateSessionCacheRisk>[0]> = {}) {
  return {
    sessionId: "session-cache-risk",
    provider: "Anthropic",
    now: "2026-10-08T12:50:00.000Z",
    cacheAnchorAt: "2026-10-08T12:00:00.000Z",
    cacheTtlSeconds: 60 * 60,
    anchorEvidence: "cache_write_1h" as const,
    contextInputTokens: 80_000,
    costUsd: null,
    costBasis: "unknown" as const,
    policy: { warningLeadSeconds: 5 * 60, minContextTokens: 50_000, minCostUsd: 0.5 },
    ...overrides,
  };
}

describe("session cache risk evaluator", () => {
  it("refuses to invent a deadline when the anchor or TTL is unsupported", () => {
    const report = evaluateSessionCacheRisk(baseInput({ cacheAnchorAt: null, cacheTtlSeconds: null, anchorEvidence: "none" }));
    expect(report.state).toBe("unknown");
    expect(report.action).toBe("unknown");
    expect(report.cacheExpiresAt).toBeNull();
    expect(report.alertKey).toBeNull();
  });

  it("suppresses interruption when no observed materiality signal crosses the policy gate", () => {
    const report = evaluateSessionCacheRisk(baseInput({
      now: "2026-10-08T12:58:00.000Z",
      contextInputTokens: 12_000,
      costUsd: 0.1,
    }));
    expect(report.state).toBe("quiet");
    expect(report.action).toBe("continue");
    expect(report.secondsUntilExpiry).toBe(120);
    expect(report.materiality.crossedBy).toEqual([]);
  });

  it("reports healthy, warning, and expired states deterministically at an injected clock", () => {
    const healthy = evaluateSessionCacheRisk(baseInput({ now: "2026-10-08T12:30:00.000Z" }));
    const warning = evaluateSessionCacheRisk(baseInput({ now: "2026-10-08T12:56:00.000Z" }));
    const expired = evaluateSessionCacheRisk(baseInput({ now: "2026-10-08T13:00:01.000Z" }));

    expect(healthy).toMatchObject({ state: "healthy", action: "continue", secondsUntilExpiry: 1800 });
    expect(warning).toMatchObject({ state: "warning", action: "prepare_handoff", secondsUntilExpiry: 240 });
    expect(expired).toMatchObject({ state: "expired", action: "handoff_now", secondsUntilExpiry: -1 });
  });

  it("allows either context or cost evidence to cross the quiet gate", () => {
    const byCost = evaluateSessionCacheRisk(baseInput({
      now: "2026-10-08T12:56:00.000Z",
      contextInputTokens: 5_000,
      costUsd: 0.8,
      costBasis: "api_equivalent_estimate",
    }));
    expect(byCost.state).toBe("warning");
    expect(byCost.materiality.crossedBy).toEqual(["cost"]);
  });

  it("uses a stable alert identity for one cache stretch and changes it after refresh", () => {
    const first = evaluateSessionCacheRisk(baseInput({ now: "2026-10-08T12:56:00.000Z" }));
    const repeat = evaluateSessionCacheRisk(baseInput({ now: "2026-10-08T12:57:00.000Z" }));
    const refreshed = evaluateSessionCacheRisk(baseInput({
      now: "2026-10-08T13:26:00.000Z",
      cacheAnchorAt: "2026-10-08T12:30:00.000Z",
      anchorEvidence: "cache_read_refresh_after_known_write",
    }));

    expect(first.alertKey).toBe(repeat.alertKey);
    expect(refreshed.alertKey).not.toBe(first.alertKey);
  });

  it("refuses to collapse mixed 5-minute and 1-hour writes into one timer", () => {
    const report = evaluateSessionCacheRisk(baseInput({ anchorEvidence: "mixed_ttl_write" }));
    expect(report.state).toBe("unknown");
    expect(report.reasons.join(" ")).toContain("mixed TTL");
  });
});

describe("Claude normalized cache evidence", () => {
  it("anchors at request/turn start and refreshes a known 1h cache horizon on a later cache read", () => {
    const lines = [
      JSON.stringify({ type: "user", uuid: "u1", sessionId: "claude-cache-session", timestamp: "2026-10-08T12:00:00.000Z" }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        requestId: "r1",
        sessionId: "claude-cache-session",
        timestamp: "2026-10-08T12:00:04.000Z",
        message: {
          id: "m1",
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "ignored by normalized risk engine" }],
          usage: {
            input_tokens: 1_000,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 60_000,
            cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 60_000 },
            output_tokens: 200,
          },
        },
      }),
      JSON.stringify({ type: "user", uuid: "u2", sessionId: "claude-cache-session", timestamp: "2026-10-08T12:30:00.000Z" }),
      JSON.stringify({
        type: "assistant",
        uuid: "a2",
        requestId: "r2",
        sessionId: "claude-cache-session",
        timestamp: "2026-10-08T12:30:06.000Z",
        message: {
          id: "m2",
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "also ignored" }],
          usage: {
            input_tokens: 1_500,
            cache_read_input_tokens: 60_000,
            cache_creation_input_tokens: 0,
            output_tokens: 250,
          },
        },
      }),
    ];

    const parsed = claudeCollector.parseJsonLines(lines, { projectId: "cache-test", environment: "test" });
    const report = deriveSessionCacheRiskFromCollector(parsed, {
      now: "2026-10-08T13:26:00.000Z",
      policy: { warningLeadSeconds: 5 * 60, minContextTokens: 50_000, minCostUsd: null },
    });

    expect(report).toMatchObject({
      sessionId: "claude-cache-session",
      provider: "Anthropic",
      state: "warning",
      action: "prepare_handoff",
      anchorEvidence: "cache_read_refresh_after_known_write",
      cacheAnchorAt: "2026-10-08T12:30:00.000Z",
      cacheExpiresAt: "2026-10-08T13:30:00.000Z",
      secondsUntilExpiry: 240,
    });
    expect(report.materiality.contextInputTokens).toBe(61_500);
    expect(report.materiality.crossedBy).toEqual(["context"]);
  });

  it("preserves canonical provider-measured cost provenance without calling it an invoice receipt", () => {
    const parsed = {
      collector: "claude" as const,
      sessionId: "provider-cost-session",
      usageClassification: "agent_measured" as const,
      events: [{
        sourceEventId: "claude:provider-cost:usage",
        source: "claude" as const,
        eventType: "llm_call.recorded" as const,
        occurredAt: new Date("2026-10-08T12:00:05.000Z"),
        projectId: null,
        runId: "run-provider-cost",
        payload: {
          id: "call-provider-cost",
          runId: "run-provider-cost",
          turnId: "turn-provider-cost",
          provider: "Anthropic",
          freshInputTokens: 1_000,
          cacheReadTokens: 0,
          cacheWriteTokens: 60_000,
          outputTokens: 100,
          costUsd: 0.75,
          costSource: "provider_measured" as const,
          startedAt: new Date("2026-10-08T12:00:00.000Z"),
          metadata: { cacheWrite5mTokens: 0, cacheWrite1hTokens: 60_000 },
        },
      }],
      warnings: [],
      measuredFields: ["cache_write_tokens", "cost_usd"],
      estimatedFields: [],
      missingFields: [],
    };

    const report = deriveSessionCacheRiskFromCollector(parsed, {
      now: "2026-10-08T12:56:00.000Z",
      policy: { minContextTokens: null, minCostUsd: 0.5 },
    });

    expect(report.state).toBe("warning");
    expect(report.materiality.costUsd).toBe(0.75);
    expect(report.materiality.costBasis).toBe("provider_measured");
    expect(report.materiality.crossedBy).toEqual(["cost"]);
  });

  it("stays unknown when 5-minute and 1-hour writes occur in separate calls", () => {
    const lines = [
      JSON.stringify({ type: "user", uuid: "mix-u1", sessionId: "mixed-cache-session", timestamp: "2026-10-08T12:00:00.000Z" }),
      JSON.stringify({
        type: "assistant",
        uuid: "mix-a1",
        requestId: "mix-r1",
        sessionId: "mixed-cache-session",
        timestamp: "2026-10-08T12:00:02.000Z",
        message: {
          id: "mix-m1",
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          content: [],
          usage: {
            input_tokens: 1_000,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 20_000,
            cache_creation: { ephemeral_5m_input_tokens: 20_000, ephemeral_1h_input_tokens: 0 },
            output_tokens: 50,
          },
        },
      }),
      JSON.stringify({ type: "user", uuid: "mix-u2", sessionId: "mixed-cache-session", timestamp: "2026-10-08T12:01:00.000Z" }),
      JSON.stringify({
        type: "assistant",
        uuid: "mix-a2",
        requestId: "mix-r2",
        sessionId: "mixed-cache-session",
        timestamp: "2026-10-08T12:01:02.000Z",
        message: {
          id: "mix-m2",
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          content: [],
          usage: {
            input_tokens: 1_000,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 60_000,
            cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 60_000 },
            output_tokens: 50,
          },
        },
      }),
    ];

    const parsed = claudeCollector.parseJsonLines(lines, { projectId: "mixed-cache-test", environment: "test" });
    const report = deriveSessionCacheRiskFromCollector(parsed, {
      now: "2026-10-08T12:02:00.000Z",
      policy: { minContextTokens: null, minCostUsd: null },
    });

    expect(report.state).toBe("unknown");
    expect(report.anchorEvidence).toBe("mixed_ttl_write");
    expect(report.cacheExpiresAt).toBeNull();
  });

  it("stays unknown for collectors that expose cache reads without a supported TTL class", () => {
    const parsed = {
      collector: "codex" as const,
      sessionId: "codex-cache-unknown",
      usageClassification: "agent_measured" as const,
      events: [{
        sourceEventId: "codex:test:usage",
        source: "codex" as const,
        eventType: "llm_call.recorded" as const,
        occurredAt: new Date("2026-10-08T12:00:00.000Z"),
        projectId: null,
        runId: "run-codex",
        payload: {
          id: "call-codex",
          runId: "run-codex",
          turnId: "turn-codex",
          provider: "OpenAI",
          cacheReadTokens: 70_000,
          cacheWriteTokens: 0,
          freshInputTokens: 1_000,
          outputTokens: 100,
          costUsd: null,
          metadata: {},
        },
      }],
      warnings: [],
      measuredFields: ["cache_read_tokens"],
      estimatedFields: [],
      missingFields: [],
    };

    const report = deriveSessionCacheRiskFromCollector(parsed, { now: "2026-10-08T12:04:00.000Z" });
    expect(report.state).toBe("unknown");
    expect(report.cacheExpiresAt).toBeNull();
  });
});
