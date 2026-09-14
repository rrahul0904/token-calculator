import { chmod, mkdir, open, readFile, rename, stat, writeFile } from "node:fs/promises";
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

export async function fileIdentity(filePath: string) {
  const info = await stat(filePath);
  return createHash("sha256").update(`${resolve(filePath)}:${info.dev}:${info.ino}`).digest("hex").slice(0, 24);
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

export async function readIncrementalJsonLines(collector: CollectorName, filePath: string, options: { reset?: boolean; checkpointPath?: string } = {}) {
  const absolute = resolve(filePath);
  const checkpointPath = options.checkpointPath ?? DEFAULT_CHECKPOINT_PATH;
  if (options.reset) await resetCheckpoint(collector, absolute, checkpointPath);
  const identity = await fileIdentity(absolute);
  const info = await stat(absolute);
  const previous = await getCheckpoint(collector, absolute, checkpointPath);
  const reusable = previous && previous.fileIdentity === identity && previous.byteOffset <= info.size;
  const start = reusable ? previous.byteOffset : 0;
  const handle = await open(absolute, "r");
  try {
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
    };
  } finally { await handle.close(); }
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
