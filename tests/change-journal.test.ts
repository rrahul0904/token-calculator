import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendChangeJournalEntry,
  buildChangeWindows,
  createChangeJournalEntry,
  parseChangeJournalText,
  readChangeJournal,
} from "@/lib/optimization/change-journal";

function applied(at = "2026-10-01T12:00:00.000Z") {
  return createChangeJournalEntry({
    event: "applied",
    occurredAt: at,
    ruleId: "context-compaction",
    collector: "claude",
    projectId: "project-a",
    source: "manual",
  });
}

describe("optimization change journal", () => {
  it("creates deterministic metadata-only identities for the same applied event", () => {
    const first = applied();
    const second = applied();
    expect(first.changeId).toBe(second.changeId);
    expect(first.eventId).toBe(second.eventId);
    expect(first.privacy).toEqual({
      metadataOnly: true,
      promptContentStored: false,
      codeContentStored: false,
      toolPayloadStored: false,
    });
  });

  it("requires an existing change id before recording a stop", () => {
    expect(() => createChangeJournalEntry({
      event: "stopped",
      occurredAt: "2026-10-02T12:00:00.000Z",
      ruleId: "context-compaction",
      collector: "claude",
      source: "manual",
    })).toThrow("changeId is required");
  });

  it("pairs applied and stopped entries into one evaluation window", () => {
    const start = applied();
    const stop = createChangeJournalEntry({
      event: "stopped",
      occurredAt: "2026-10-05T12:00:00.000Z",
      ruleId: start.ruleId,
      collector: start.collector,
      projectId: start.projectId,
      source: start.source,
      changeId: start.changeId,
    });
    const result = buildChangeWindows([stop, start]);
    expect(result.warnings).toEqual([]);
    expect(result.changes).toEqual([{
      changeId: start.changeId,
      ruleId: "context-compaction",
      appliedAt: "2026-10-01T12:00:00.000Z",
      stoppedAt: "2026-10-05T12:00:00.000Z",
      collector: "claude",
      projectId: "project-a",
      source: "manual",
    }]);
  });

  it("deduplicates repeated journal event ids and hides malformed record content from warnings", () => {
    const entry = applied();
    const text = `${JSON.stringify(entry)}\n${JSON.stringify(entry)}\n{not-json-containing-secret-payload}\n`;
    const result = parseChangeJournalText(text);
    expect(result.entries).toHaveLength(1);
    expect(result.warnings).toEqual(["One change-journal record could not be parsed and was skipped."]);
    expect(result.warnings.join(" ")).not.toContain("secret-payload");
  });

  it("persists and rereads a local append-only journal with restrictive permissions where supported", async () => {
    const root = await mkdtemp(join(tmpdir(), "ti-change-journal-"));
    const path = join(root, "changes.jsonl");
    const entry = applied();
    await appendChangeJournalEntry(entry, path);
    const parsed = await readChangeJournal(path);
    expect(parsed.entries).toEqual([entry]);
    expect((await readFile(path, "utf8")).trim()).toBe(JSON.stringify(entry));
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
