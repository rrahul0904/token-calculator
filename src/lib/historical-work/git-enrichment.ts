import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import * as z from "zod";
import type { HistoricalWorkReconstruction } from "./reconstruction";

const execFile = promisify(execFileCallback);
const windowSchema = z.object({ since: z.string().datetime({ offset: true }), until: z.string().datetime({ offset: true }) }).strict();

export interface GitCommandRunner {
  (cwd: string, args: readonly string[]): Promise<string>;
}

export interface GitHistoryMetadata {
  schemaVersion: "1";
  readOnly: true;
  repositoryRef: string;
  commits: Array<{ commitRef: string; committedAt: string; changedPathCount: number }>;
}

/** Reads commit timestamps and changed-path counts only; paths and commit messages never leave this function. */
export async function readGitHistoryMetadata(
  cwd: string,
  windowInput: unknown,
  run: GitCommandRunner = async (directory, args) => (await execFile("git", [...args], { cwd: directory, maxBuffer: 8 * 1024 * 1024 })).stdout,
): Promise<GitHistoryMetadata> {
  const window = windowSchema.parse(windowInput);
  const log = await run(cwd, ["log", "--format=%H%x09%cI", "--no-renames", `--since=${window.since}`, `--until=${window.until}`, "--"]);
  const commits: GitHistoryMetadata["commits"] = [];
  for (const line of log.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([a-f0-9]{40,64})\t(.+)$/.exec(line);
    if (!match || !Number.isFinite(Date.parse(match[2]))) continue;
    const stats = await run(cwd, ["show", "--format=", "--numstat", "--no-renames", match[1], "--"]);
    const changedPathCount = stats.split(/\r?\n/).filter((row) => /^\d+\t\d+\t|^-\t-\t/.test(row)).length;
    commits.push({
      commitRef: opaque("commit", match[1]),
      committedAt: new Date(match[2]).toISOString(),
      changedPathCount,
    });
  }
  commits.sort((left, right) => left.committedAt.localeCompare(right.committedAt) || left.commitRef.localeCompare(right.commitRef));
  return { schemaVersion: "1", readOnly: true, repositoryRef: opaque("repository", cwd), commits };
}

/** Adds temporal commit links only; proximity is not evidence of intent or authorship. */
export function enrichHistoricalWorkWithGit(
  reconstruction: HistoricalWorkReconstruction,
  history: GitHistoryMetadata,
) {
  const taskLinks = reconstruction.tasks.map((task) => {
    const firstTurn = reconstruction.turns.find((turn) => turn.turnRef === task.turnRefs[0]);
    const taskTime = firstTurn?.occurredAt ? Date.parse(firstTurn.occurredAt) : null;
    const closest = history.commits
      .map((commit) => ({ commit, distance: taskTime === null ? Infinity : Math.abs(Date.parse(commit.committedAt) - taskTime) }))
      .filter((item) => item.distance <= 15 * 60_000)
      .sort((left, right) => left.distance - right.distance || left.commit.commitRef.localeCompare(right.commit.commitRef))[0];
    return { taskRef: task.taskRef, commitRefs: closest ? [closest.commit.commitRef] : [], basis: "temporal-proximity" as const };
  });
  return { schemaVersion: "1" as const, repositoryRef: history.repositoryRef, taskLinks };
}

function opaque(kind: string, value: string) {
  return `${kind}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}
