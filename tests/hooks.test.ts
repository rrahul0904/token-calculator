import { describe, expect, it } from "vitest";
import { normalizeHookEvent } from "@/lib/telemetry/hooks";

describe("generic telemetry hooks", () => {
  it("normalizes run and outcome hooks into canonical telemetry events", () => {
    const events = normalizeHookEvent({
      hookId: "hook-12345678",
      source: "documented-agent-hook",
      event: "run.completed",
      occurredAt: "2026-09-01T12:00:00Z",
      runId: "run_12345678",
      metadata: { workflowName: "review" },
      outcome: { status: "success", testsPassed: true, taskCompleted: true },
    });
    expect(events.map((event) => event.eventType)).toEqual(["run.upsert", "outcome.recorded"]);
    expect(events.every((event) => event.source.startsWith("hook:"))).toBe(true);
  });

  it("keeps provider-native usage dimensions on llm hooks", () => {
    const event = normalizeHookEvent({
      hookId: "hook-llm-1234",
      source: "agent",
      event: "llm.completed",
      occurredAt: "2026-09-01T12:00:00Z",
      runId: "run_12345678",
      usage: { provider: "anthropic", model: "claude", freshInputTokens: 100, cacheReadTokens: 800, cacheWriteTokens: 20, reasoningTokens: 10, outputTokens: 50, usageSource: "agent_measured" },
    })[0];
    expect(event.eventType).toBe("llm_call.recorded");
    expect(event.payload.cacheReadTokens).toBe(800);
    expect(event.payload.costSource).toBe("agent_measured");
  });

  it("rejects content-bearing hook metadata", () => {
    expect(() => normalizeHookEvent({
      hookId: "hook-secret-1",
      source: "agent",
      event: "run.started",
      occurredAt: "2026-09-01T12:00:00Z",
      runId: "run_12345678",
      metadata: { prompt: "do not upload" },
    })).toThrow(/CONTENT_RETENTION_DISABLED/);
  });

  it("requires stable identifiers for turn/tool specific hooks", () => {
    expect(() => normalizeHookEvent({ hookId: "hook-turn-1", source: "agent", event: "turn.started", occurredAt: new Date(), runId: "run_12345678" })).toThrow(/HOOK_TURN_ID_REQUIRED/);
    expect(() => normalizeHookEvent({ hookId: "hook-tool-1", source: "agent", event: "tool.completed", occurredAt: new Date(), runId: "run_12345678" })).toThrow(/HOOK_TOOL_REQUIRED/);
  });
});
