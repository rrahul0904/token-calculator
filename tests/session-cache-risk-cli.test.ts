import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionCacheRiskReport } from "@/lib/optimization/session-cache-risk";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function writeClaudeCacheFixture() {
  const root = await mkdtemp(join(tmpdir(), "token-intelligence-cache-risk-"));
  tempRoots.push(root);
  const file = join(root, "session.jsonl");
  const rows = [
    { type: "user", uuid: "u1", sessionId: "cli-cache-session", timestamp: "2026-10-08T12:00:00.000Z" },
    {
      type: "assistant",
      uuid: "a1",
      requestId: "r1",
      sessionId: "cli-cache-session",
      timestamp: "2026-10-08T12:00:03.000Z",
      message: {
        id: "m1",
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "fixture output is not emitted by the risk report" }],
        usage: {
          input_tokens: 2_000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 70_000,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 70_000 },
          output_tokens: 100,
        },
      },
    },
  ];
  await writeFile(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return { root, file };
}

describe("cache risk CLI", () => {
  it("runs offline against a real local-history file and emits a bounded normalized report", async () => {
    const { root, file } = await writeClaudeCacheFixture();
    const tsxBinary = resolve(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
    const stdout = execFileSync(
      tsxBinary,
      [
        "scripts/cache-risk.ts",
        "claude",
        file,
        "--now",
        "2026-10-08T12:56:00.000Z",
        "--warning-minutes",
        "5",
        "--min-context",
        "50000",
        "--min-cost",
        "none",
        "--json",
      ],
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

    const report = JSON.parse(stdout) as SessionCacheRiskReport;
    expect(report).toMatchObject({
      sessionId: "cli-cache-session",
      provider: "Anthropic",
      state: "warning",
      action: "prepare_handoff",
      anchorEvidence: "cache_write_1h",
      cacheAnchorAt: "2026-10-08T12:00:00.000Z",
      cacheExpiresAt: "2026-10-08T13:00:00.000Z",
      secondsUntilExpiry: 240,
    });
    expect(JSON.stringify(report)).not.toContain(root);
    expect(JSON.stringify(report)).not.toContain("fixture output");
  });
});
