import { chmod, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { CollectorName } from "@/lib/collectors/types";

export const DEFAULT_CHECKPOINT_PATH = resolve(homedir(), ".config", "token-intelligence", "checkpoints.json");

export interface CollectorCheckpoint {
  collector: CollectorName;
  filePath: string;
  fileIdentity: string;
  byteOffset: number;
  lastSuccessfulUploadAt: string | null;
  sourceVersion: string | null;
}

interface CheckpointStore { version: 1; checkpoints: Record<string, CollectorCheckpoint> }

const emptyStore = (): CheckpointStore => ({ version: 1, checkpoints: {} });
const keyFor = (collector: CollectorName, filePath: string) => `${collector}:${resolve(filePath)}`;

function identityFromStat(filePath: string, info: { dev: number | bigint; ino: number | bigint }) {
  return createHash("sha256")
    .update(`${resolve(filePath)}:${String(info.dev)}:${String(info.ino)}`)
    .digest("hex")
    .slice(0, 24);
}

export async function fileIdentity(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const info = await handle.stat();
    return identityFromStat(filePath, info);
  } finally {
    await handle.close();
  }
}

export async function readCheckpointStore(path = DEFAULT_CHECKPOINT_PATH): Promise<CheckpointStore> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as CheckpointStore;
    if (parsed.version !== 1 || !parsed.checkpoints || typeof parsed.checkpoints !== "object") return emptyStore();
    return parsed;
  } catch { return emptyStore(); }
}

export async function getCheckpoint(collector: CollectorName, filePath: string, path = DEFAULT_CHECKPOINT_PATH) {
  const store = await readCheckpointStore(path);
  return store.checkpoints[keyFor(collector, filePath)] ?? null;
}

export async function saveCheckpoint(checkpoint: CollectorCheckpoint, path = DEFAULT_CHECKPOINT_PATH) {
  const store = await readCheckpointStore(path);
  store.checkpoints[keyFor(checkpoint.collector, checkpoint.filePath)] = checkpoint;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
  try { await chmod(path, 0o600); } catch { /* POSIX permissions may be unavailable. */ }
}

export async function resetCheckpoint(collector: CollectorName, filePath: string, path = DEFAULT_CHECKPOINT_PATH) {
  const store = await readCheckpointStore(path);
  delete store.checkpoints[keyFor(collector, filePath)];
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try { await chmod(path, 0o600); } catch { /* POSIX permissions may be unavailable. */ }
}

/**
 * Incremental collectors are newline-delimited JSON by contract. Refuse the
 * whole chunk when a complete line is malformed so callers cannot upload a
 * partial interpretation and then advance the durable checkpoint past input
 * they did not understand. The raw record is intentionally never echoed.
 */
export function assertCompleteJsonLines(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    try {
      JSON.parse(lines[index]);
    } catch {
      throw new Error(`Incremental source contains malformed JSON at complete record ${index + 1}; checkpoint was not advanced.`);
    }
  }
}

export async function readIncrementalJsonLines(collector: CollectorName, filePath: string, options: { reset?: boolean; checkpointPath?: string } = {}) {
  const absolute = resolve(filePath);
  const checkpointPath = options.checkpointPath ?? DEFAULT_CHECKPOINT_PATH;
  if (options.reset) await resetCheckpoint(collector, absolute, checkpointPath);

  // Open once, then derive identity/size and read from that same descriptor. This
  // removes the stat-then-open race where a path could be replaced between the
  // metadata check and the actual read.
  const handle = await open(absolute, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("Incremental source is not a regular file.");
    const identity = identityFromStat(absolute, info);
    const previous = await getCheckpoint(collector, absolute, checkpointPath);
    const sameIdentity = previous?.fileIdentity === identity;
    const offsetFits = previous ? previous.byteOffset <= info.size : false;
    const reusable = Boolean(previous && sameIdentity && offsetFits);
    const resetReason = previous && !reusable
      ? (!sameIdentity ? "identity_changed" : "truncated")
      : null;
    const start = reusable && previous ? previous.byteOffset : 0;
    const length = Math.max(0, info.size - start);
    const buffer = Buffer.alloc(length);
    if (length) await handle.read(buffer, 0, length, start);
    const text = buffer.toString("utf8");
    // A collector record must be newline-delimited. Avoid checkpointing a partial trailing line.
    const lastNewline = text.lastIndexOf("\n");
    const completeText = lastNewline >= 0 ? text.slice(0, lastNewline + 1) : "";
    const consumedBytes = Buffer.byteLength(completeText, "utf8");
    return {
      lines: completeText.split(/\r?\n/).filter(Boolean),
      nextOffset: start + consumedBytes,
      fileIdentity: identity,
      startOffset: start,
      fileSize: info.size,
      checkpointPath,
      resetReason,
    };
  } finally {
    await handle.close();
  }
}

export async function commitCheckpoint(args: { collector: CollectorName; filePath: string; fileIdentity: string; nextOffset: number; sourceVersion?: string | null; checkpointPath?: string }) {
  const checkpoint: CollectorCheckpoint = {
    collector: args.collector,
    filePath: resolve(args.filePath),
    fileIdentity: args.fileIdentity,
    byteOffset: args.nextOffset,
    lastSuccessfulUploadAt: new Date().toISOString(),
    sourceVersion: args.sourceVersion ?? null,
  };
  await saveCheckpoint(checkpoint, args.checkpointPath ?? DEFAULT_CHECKPOINT_PATH);
  return checkpoint;
}
