import { describe, expect, it, vi } from "vitest";
import { enrichHistoricalWorkWithGit, readGitHistoryMetadata, type GitCommandRunner } from "@/lib/historical-work/git-enrichment";
import { exportHistoricalWorkReport, importClaudeCodeJsonl, importCodexSessionJsonl, importHistoricalWorkJsonl } from "@/lib/historical-work/history-import";
import { reconstructHistoricalWork } from "@/lib/historical-work/reconstruction";

const event = {
  type: "turn",
  eventId: "fixture-event-1",
  occurredAt: "2026-10-01T12:00:00.000Z",
  modelRef: "fixture-model",
  usage: { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 2 },
  reportedCostUsd: null,
  estimatedCostUsd: 0.01,
};

describe("historical work import", () => {
  it("imports strict metadata JSONL with provenance and stable re-import identity", () => {
    const fixture = JSON.stringify(event);
    const first = reconstructHistoricalWork(importHistoricalWorkJsonl(fixture, { sourceRef: "fixture", projectRef: "project" }));
    const replay = reconstructHistoricalWork(importHistoricalWorkJsonl(`${fixture}\n${fixture}`, { sourceRef: "fixture", projectRef: "project" }));
    expect(first).toEqual(replay);
    expect(first.turns[0].provenance?.adapter).toBe("token-intelligence-history-v1");
    expect(JSON.stringify(first)).not.toContain("fixture-event-1");
    expect(() => importHistoricalWorkJsonl(JSON.stringify({ ...event, prompt: "private fixture text" }), { sourceRef: "x", projectRef: "y" })).toThrow();
    expect(() => importHistoricalWorkJsonl("not-json", { sourceRef: "x", projectRef: "y" })).toThrow("Invalid history JSON on line 1");
  });

  it("imports Codex token-count events using per-turn usage or cumulative deltas", () => {
    const lines = [
      { type: "turn_context", timestamp: "2026-10-01T12:00:00.000Z", payload: { turn_id: "turn-1", model: "gpt-5-codex" } },
      { type: "event_msg", timestamp: "2026-10-01T12:00:01.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 4 } } } },
      { type: "turn_context", timestamp: "2026-10-01T12:01:00.000Z", payload: { turn_id: "turn-2", model: "gpt-5-codex" } },
      { type: "event_msg", timestamp: "2026-10-01T12:01:01.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 160, cached_input_tokens: 30, output_tokens: 25, reasoning_output_tokens: 10 } } } },
      { type: "response_item", timestamp: "2026-10-01T12:01:02.000Z", payload: { type: "message", role: "assistant", content: [{ text: "private assistant response" }] } },
    ];
    const fixture = lines.map((line) => JSON.stringify(line)).join("\n");
    const first = importCodexSessionJsonl(fixture, { sourceRef: "codex-source", projectRef: "project" });
    const replay = importCodexSessionJsonl(`${fixture}\n${JSON.stringify(lines[1])}\n${JSON.stringify(lines[3])}`, { sourceRef: "codex-source", projectRef: "project" });
    const result = reconstructHistoricalWork(first);
    expect(result.turns).toHaveLength(2);
    expect(result.turns.map((turn) => turn.usage)).toEqual([
      { inputTokens: 100, cacheReadTokens: 20, cacheWriteTokens: null, outputTokens: 10 },
      { inputTokens: 60, cacheReadTokens: 10, cacheWriteTokens: null, outputTokens: 15 },
    ]);
    expect(reconstructHistoricalWork(replay)).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("private assistant response");
  });

  it("imports Claude Code assistant usage and drops message content and unsafe model labels", () => {
    const fixture = JSON.stringify({
      type: "assistant",
      uuid: "message-1",
      timestamp: "2026-10-01T12:00:00.000Z",
      message: {
        model: "/Users/private/customer prompt.txt",
        content: [{ type: "text", text: "private Claude response" }],
        usage: { input_tokens: 40, cache_read_input_tokens: 12, cache_creation_input_tokens: 5, output_tokens: 9 },
      },
    });
    const result = reconstructHistoricalWork(importClaudeCodeJsonl(fixture, { sourceRef: "claude-source", projectRef: "project" }));
    expect(result.turns[0]).toMatchObject({
      modelRef: expect.stringMatching(/^unknown_[a-f0-9]{16}$/),
      usage: { inputTokens: 40, cacheReadTokens: 12, cacheWriteTokens: 5, outputTokens: 9 },
      provenance: { adapter: "claude-code-project-jsonl-v1" },
    });
    expect(JSON.stringify(result)).not.toContain("private Claude response");
    expect(JSON.stringify(result)).not.toContain("/Users/private");
  });

  it("exports a metadata-only JSON report with cost coverage kept separate", () => {
    const reconstruction = reconstructHistoricalWork(importHistoricalWorkJsonl(JSON.stringify(event), { sourceRef: "fixture", projectRef: "project" }));
    const report = exportHistoricalWorkReport(reconstruction);
    expect(JSON.parse(report)).toMatchObject({
      summary: { turnCount: 1, taskCount: 1, sittingCount: 1, pricingCoverage: { estimated: 1, reported: 0, unknown: 0 } },
      privacy: { rawPromptsRetained: false, sourcePathsRetained: false },
    });
    expect(report).not.toContain("fixture-event-1");
  });

  it("rejects conflicting duplicate event identities instead of selecting one silently", () => {
    expect(() => reconstructHistoricalWork(importHistoricalWorkJsonl([
      JSON.stringify(event), JSON.stringify({ ...event, usage: { ...event.usage, outputTokens: 99 } }),
    ].join("\n"), { sourceRef: "fixture", projectRef: "project" }))).toThrow("Conflicting duplicate history event");
  });
});

describe("read-only Git enrichment", () => {
  it("extracts only opaque commit metadata and runs fixed read-only Git commands", async () => {
    const runner = vi.fn<GitCommandRunner>(async (_cwd, args) => {
      if (args[0] === "log") return `${"a".repeat(40)}\t2026-10-01T12:02:00+00:00`;
      return "1\t2\tprivate/file-name.ts\n-\t-\tbinary.dat\n";
    });
    const git = await readGitHistoryMetadata("/synthetic/repository", {
      since: "2026-10-01T00:00:00.000Z", until: "2026-10-02T00:00:00.000Z",
    }, runner);
    const history = importHistoricalWorkJsonl(JSON.stringify(event), { sourceRef: "fixture", projectRef: "project" });
    const reconstructed = reconstructHistoricalWork(history);
    const enriched = enrichHistoricalWorkWithGit(reconstructed, git);
    expect(git.commits).toHaveLength(1);
    expect(git.commits[0].changedPathCount).toBe(2);
    expect(JSON.stringify({ git, enriched })).not.toContain("private/file-name.ts");
    expect(enriched.taskLinks[0].commitRefs).toEqual([git.commits[0].commitRef]);
    expect(runner.mock.calls.map(([, args]) => args[0])).toEqual(["log", "show"]);
    expect(runner.mock.calls.every(([, args]) => !args.some((arg) => ["commit", "checkout", "reset", "add"].includes(arg)))).toBe(true);
  });
});
