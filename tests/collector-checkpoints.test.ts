import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitCheckpoint, getCheckpoint, readIncrementalJsonLines, resetCheckpoint } from "@/lib/collectors/checkpoints";

describe("collector checkpoints", () => {
  it("reads only complete appended JSONL records and resumes after commit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ti-checkpoint-"));
    const file = join(dir, "session.jsonl");
    const checkpointPath = join(dir, "checkpoints.json");
    await writeFile(file, '{"a":1}\n{"a":2}\n{"partial":', "utf8");

    const first = await readIncrementalJsonLines("codex", file, { checkpointPath });
    expect(first.lines).toEqual(['{"a":1}', '{"a":2}']);
    expect(first.nextOffset).toBeGreaterThan(0);
    expect(first.nextOffset).toBeLessThan(first.fileSize);

    await commitCheckpoint({ collector: "codex", filePath: file, fileIdentity: first.fileIdentity, nextOffset: first.nextOffset, checkpointPath });
    await writeFile(file, '{"a":1}\n{"a":2}\n{"partial":true}\n{"a":3}\n', "utf8");
    const second = await readIncrementalJsonLines("codex", file, { checkpointPath });
    expect(second.lines).toEqual(['{"partial":true}', '{"a":3}']);
  });

  it("stores checkpoint files as a versioned local structure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ti-checkpoint-"));
    const file = join(dir, "session.jsonl");
    const checkpointPath = join(dir, "checkpoints.json");
    await writeFile(file, '{"a":1}\n', "utf8");
    const chunk = await readIncrementalJsonLines("claude", file, { checkpointPath });
    await commitCheckpoint({ collector: "claude", filePath: file, fileIdentity: chunk.fileIdentity, nextOffset: chunk.nextOffset, checkpointPath, sourceVersion: "fixture" });
    const stored = await getCheckpoint("claude", file, checkpointPath);
    expect(stored?.sourceVersion).toBe("fixture");
    expect(JSON.parse(await readFile(checkpointPath, "utf8")).version).toBe(1);
    await resetCheckpoint("claude", file, checkpointPath);
    expect(await getCheckpoint("claude", file, checkpointPath)).toBeNull();
  });

  it("resets safely when a file is truncated", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ti-checkpoint-"));
    const file = join(dir, "session.jsonl");
    const checkpointPath = join(dir, "checkpoints.json");
    await writeFile(file, '{"a":1}\n{"a":2}\n', "utf8");
    const first = await readIncrementalJsonLines("antigravity", file, { checkpointPath });
    await commitCheckpoint({ collector: "antigravity", filePath: file, fileIdentity: first.fileIdentity, nextOffset: first.nextOffset, checkpointPath });
    await writeFile(file, '{"b":1}\n', "utf8");
    const reset = await readIncrementalJsonLines("antigravity", file, { checkpointPath });
    expect(reset.startOffset).toBe(0);
    expect(reset.lines).toEqual(['{"b":1}']);
  });
});
