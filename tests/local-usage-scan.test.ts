import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCollectorHistoryRoots, formatLocalUsageScanReport, scanLocalUsage } from "@/lib/optimization/local-usage-scan";

const tempRoots: string[] = [];

async function makeTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "token-intelligence-scan-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function writeCodexHistories() {
  const root = await makeTempRoot();
  const nested = join(root, "nested");
  await mkdir(nested, { recursive: true });
  const fixture = await readFile(resolve(process.cwd(), "tests/fixtures/codex-local-audit.jsonl"), "utf8");
  const second = fixture
    .replaceAll("codex-local-audit-fixture", "codex-local-audit-fixture-two")
    .replaceAll("turn-local-audit-001", "turn-local-audit-002")
    .replaceAll("2026-09-16T", "2026-09-17T");
  await writeFile(join(root, "first.jsonl"), fixture, "utf8");
  await writeFile(join(root, "duplicate.ndjson"), fixture, "utf8");
  await writeFile(join(nested, "second.jsonl"), second, "utf8");
  await writeFile(join(root, "ignore.txt"), fixture, "utf8");
  return root;
}

describe("local multi-session usage scan", () => {
  it("discovers recursively, collapses duplicate sessions, and produces day/week/month rollups", async () => {
    const root = await writeCodexHistories();
    const report = await scanLocalUsage({
      collector: "codex",
      roots: [root],
      generatedAt: "2026-09-17T12:00:00.000Z",
    });

    expect(report.generatedAt).toBe("2026-09-17T12:00:00.000Z");
    expect(report.discovery).toMatchObject({
      automatic: false,
      rootsAttempted: 1,
      filesDiscovered: 3,
      filesParsed: 3,
      filesFailed: 0,
      duplicateSessionsCollapsed: 1,
    });
    expect(report.privacy).toEqual({
      localOnly: true,
      contentStored: false,
      rawPromptContentInspected: false,
      networkRequestsRequired: false,
      sourcePathsIncludedInReport: false,
    });
    expect(report.overall).toMatchObject({
      sessions: 2,
      runs: 2,
      turns: 2,
      freshInputTokens: 16_000,
      cacheReadTokens: 4_000,
      reasoningTokens: 12_000,
      outputTokens: 2_000,
      knownCostUsd: null,
      sessionsWithKnownCost: 0,
      sessionsWithoutKnownCost: 2,
    });
    expect(report.overall.opportunity.additiveSavingsClaimed).toBe(false);
    expect(report.overall.findings.find((finding) => finding.ruleId === "reasoning-review-candidate")).toMatchObject({
      occurrences: 2,
      affectedSessions: 2,
    });
    expect(report.rollups.daily).toHaveLength(2);
    expect(report.rollups.weekly).toHaveLength(1);
    expect(report.rollups.monthly).toHaveLength(1);
    expect(report.rankings.models[0]).toMatchObject({ key: "reasoning-model", records: 2, totalTokens: 34_000, knownCostUsd: null });
  });

  it("uses session-end attribution for time windows without slicing cumulative run totals", async () => {
    const root = await writeCodexHistories();
    const report = await scanLocalUsage({
      collector: "codex",
      roots: [root],
      since: new Date("2026-09-17T00:00:00.000Z"),
      generatedAt: "2026-09-17T12:00:00.000Z",
    });

    expect(report.window).toEqual({ since: "2026-09-17T00:00:00.000Z", attribution: "session_end" });
    expect(report.overall.sessions).toBe(1);
    expect(report.overall.freshInputTokens).toBe(8_000);
    expect(report.overall.reasoningTokens).toBe(6_000);
    expect(report.rollups.daily).toHaveLength(1);
    expect(report.rollups.daily[0].periodStart).toBe("2026-09-17T00:00:00.000Z");
  });

  it("keeps auto-discovery conservative when a repository-certified path is unknown", () => {
    expect(defaultCollectorHistoryRoots("codex", "/home/test")).toEqual(["/home/test/.codex/sessions"]);
    expect(defaultCollectorHistoryRoots("claude", "/home/test")).toEqual(["/home/test/.claude/projects"]);
    expect(defaultCollectorHistoryRoots("cursor", "/home/test")).toEqual([]);
    expect(defaultCollectorHistoryRoots("antigravity", "/home/test")).toEqual([]);
  });

  it("formats overlap-safe human output without leaking local paths", async () => {
    const root = await writeCodexHistories();
    const report = await scanLocalUsage({ collector: "codex", roots: [root], generatedAt: "2026-09-17T12:00:00.000Z" });
    const text = formatLocalUsageScanReport(report);

    expect(text).toContain("Token Intelligence local history scan");
    expect(text).toContain("2 deduplicated sessions");
    expect(text).toContain("does not add them into a headline savings total");
    expect(text).toContain("source paths are omitted from the report");
    expect(text).not.toContain(root);
  });

  it("executes the real CLI scan path offline against an explicit history file", () => {
    const tsxBinary = resolve(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
    const stdout = execFileSync(
      tsxBinary,
      ["scripts/ti.ts", "scan", "codex", "tests/fixtures/codex-local-audit.jsonl", "--json"],
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
    const report = JSON.parse(stdout) as Awaited<ReturnType<typeof scanLocalUsage>>;

    expect(report.collector).toBe("codex");
    expect(report.overall.sessions).toBe(1);
    expect(report.discovery.filesDiscovered).toBe(1);
    expect(report.privacy.networkRequestsRequired).toBe(false);
    expect(report.overall.findings.some((finding) => finding.ruleId === "reasoning-review-candidate")).toBe(true);
  });
});
