import { describe, expect, it } from "vitest";
import { antigravityCollector } from "@/lib/collectors/antigravity";
import { claudeCollector } from "@/lib/collectors/claude";
import { codexCollector } from "@/lib/collectors/codex";
import { cursorCollector } from "@/lib/collectors/cursor";
import { collectorCapabilities, getCollector } from "@/lib/collectors/registry";

const jsonl = (records: unknown[]) => records.map((record) => JSON.stringify(record));

describe("collector registry", () => {
  it("registers all supported coding-agent adapters", async () => {
    expect(getCollector("codex")).toBe(codexCollector);
    expect(getCollector("claude")).toBe(claudeCollector);
    expect(getCollector("cursor")).toBe(cursorCollector);
    expect(getCollector("antigravity")).toBe(antigravityCollector);
    expect(getCollector("unknown")).toBeNull();

    const capabilities = await collectorCapabilities();
    expect(capabilities.map((item) => item.name).sort()).toEqual(["antigravity", "claude", "codex", "cursor"]);
    expect(capabilities.find((item) => item.name === "cursor")?.measuredUsage).toBe(false);
    expect(capabilities.find((item) => item.name === "antigravity")?.measuredUsage).toBe(true);
  });
});

describe("Codex collector", () => {
  it("converts cumulative usage into fresh deltas and preserves aborted work", () => {
    const result = codexCollector.parseJsonLines(jsonl([
      { type: "session_meta", timestamp: "2026-08-31T10:00:00Z", payload: { session_id: "codex-fixture-1", cli_version: "0.145.0" } },
      { type: "turn_context", timestamp: "2026-08-31T10:00:01Z", payload: { turn_id: "turn-codex-0001", model: "gpt-5.6-sol", reasoning_effort: "medium" } },
      { type: "event_msg", timestamp: "2026-08-31T10:00:02Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 1000, cached_input_tokens: 200, output_tokens: 100, reasoning_output_tokens: 40, total_tokens: 1100 } } } },
      { type: "event_msg", timestamp: "2026-08-31T10:00:03Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 1500, cached_input_tokens: 300, output_tokens: 140, reasoning_output_tokens: 50, total_tokens: 1640 } } } },
      { type: "event_msg", timestamp: "2026-08-31T10:00:04Z", payload: { type: "turn_aborted", turn_id: "turn-codex-0001", reason: "interrupted", duration_ms: 3000 } },
    ]));

    expect(result.usageClassification).toBe("agent_measured");
    const run = result.events.find((event) => event.eventType === "run.upsert");
    expect(run?.payload.usageSource).toBe("agent_measured");
    expect(run?.payload.status).toBe("aborted");
    expect(run?.payload.cacheReadTokens).toBe(300);
    expect(run?.payload.freshInputTokens).toBe(1200);
  });

  it("skips malformed records without uploading content", () => {
    const result = codexCollector.parseJsonLines(["{not-json}"]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.events)).not.toContain("{not-json}");
  });
});

describe("Claude Code collector", () => {
  it("keeps cache-read and cache-write usage in measured receipts", () => {
    const result = claudeCollector.parseJsonLines(jsonl([
      {
        uuid: "claude-record-1",
        sessionId: "claude-fixture-1",
        type: "assistant",
        timestamp: "2026-08-31T11:00:00Z",
        requestId: "req-fixture-1",
        message: {
          id: "msg-fixture-1",
          model: "claude-opus-5",
          role: "assistant",
          stop_reason: "end_turn",
          content: [],
          usage: {
            input_tokens: 10,
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 200,
            output_tokens: 25,
            cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 30 },
          },
        },
      },
    ]));

    expect(result.usageClassification).toBe("agent_measured");
    const run = result.events.find((event) => event.eventType === "run.upsert");
    expect(run?.payload.cacheReadTokens).toBe(200);
    expect(run?.payload.cacheWriteTokens).toBe(50);
    expect(run?.payload.freshInputTokens).toBe(10);
  });
});

describe("Cursor collector", () => {
  it("keeps heuristic token values explicitly estimated", () => {
    const result = cursorCollector.parseJsonLines(jsonl([
      { sessionId: "cursor-fixture-1", type: "file_read", timestamp: "2026-08-31T12:00:00Z", path: "/repo/src/a.ts", sizeBytes: 4000 },
      { sessionId: "cursor-fixture-1", type: "assistant_response", timestamp: "2026-08-31T12:00:01Z", text: "x".repeat(400) },
    ]));
    expect(result.usageClassification).toBe("estimated");
    const run = result.events.find((event) => event.eventType === "run.upsert");
    expect(run?.payload.usageSource).toBe("estimated");
    expect(run?.payload.freshInputTokens).toBe(1000);
  });
});

describe("Antigravity collector", () => {
  it("uses documented stream-json usage as agent-measured telemetry and drops raw content", () => {
    const secretToolOutput = "private-command-output";
    const result = antigravityCollector.parseJsonLines(jsonl([
      { event: "init", conversation_id: "ag-fixture-1", init: { model: "gemini-3.1-pro", agent: "default", cwd: "/repo" } },
      {
        event: "step_update",
        step_update: {
          conversation_id: "ag-fixture-1",
          step_index: 1,
          step_type: "tool",
          state: "DONE",
          duration_seconds: 0.5,
          tool_name: "run_command",
          tool_info: { output: secretToolOutput },
        },
      },
      {
        event: "step_update",
        step_update: {
          conversation_id: "ag-fixture-1",
          step_index: 2,
          step_type: "agent_response",
          state: "DONE",
          duration_seconds: 1.25,
          usage: { input_tokens: 1000, cache_read_tokens: 250, thinking_tokens: 80, output_tokens: 120, total_tokens: 1120 },
          response: "private-response-text",
        },
      },
      {
        event: "result",
        result: {
          conversation_id: "ag-fixture-1",
          status: "SUCCESS",
          duration_seconds: 2,
          num_turns: 1,
          usage: { input_tokens: 1000, cache_read_tokens: 250, thinking_tokens: 80, output_tokens: 120, total_tokens: 1120 },
        },
      },
    ]));

    expect(result.usageClassification).toBe("agent_measured");
    const run = result.events.find((event) => event.eventType === "run.upsert");
    expect(run?.payload.freshInputTokens).toBe(750);
    expect(run?.payload.cacheReadTokens).toBe(250);
    expect(run?.payload.reasoningTokens).toBe(80);
    expect(run?.payload.outputTokens).toBe(120);
    const serialized = JSON.stringify(result.events);
    expect(serialized).not.toContain(secretToolOutput);
    expect(serialized).not.toContain("private-response-text");
  });
});
