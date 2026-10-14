import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { commitCheckpoint, fileIdentity, getCheckpoint, readIncrementalJsonLines, readIncrementalJsonLinesFromHandle, resetCheckpoint } from "@/lib/collectors/checkpoints";

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

  it("keeps identity and bytes bound to the opened file handle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ti-checkpoint-"));
    const file = join(dir, "session.jsonl");
    const openedFile = join(dir, "opened-session.jsonl");
    await writeFile(openedFile, '{"old":true}\n', "utf8");
    await writeFile(file, '{"new":true}\n', "utf8");
    const openedInfo = await stat(openedFile);
    const handle = {
      stat: async () => openedInfo,
      read: async (buffer: Buffer, offset: number, _length: number, _position: number) => {
        const bytesRead = buffer.write('{"old":true}\n', offset, "utf8");
        return { bytesRead, buffer };
      },
      close: async () => undefined,
    } as unknown as Awaited<ReturnType<typeof import("node:fs/promises").open>>;

    try {
      const chunk = await readIncrementalJsonLinesFromHandle("codex", file, handle, join(dir, "checkpoints.json"));
      expect(chunk.lines).toEqual(['{"old":true}']);
      const expectedIdentity = createHash("sha256").update(`${resolve(file)}:${openedInfo.dev}:${openedInfo.ino}`).digest("hex").slice(0, 24);
      expect(chunk.fileIdentity).toBe(expectedIdentity);
      expect(chunk.fileIdentity).not.toBe(await fileIdentity(file));
    } finally {
      await handle.close();
    }
  });
});
