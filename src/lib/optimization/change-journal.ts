import { createHash } from "node:crypto";
import { appendFile, chmod, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { OptimizationChangeSource, OptimizationChangeWindow } from "@/lib/optimization/change-effectiveness";

export type OptimizationChangeJournalEvent = "applied" | "stopped";

export interface OptimizationChangeJournalEntry {
  schemaVersion: "1";
  eventId: string;
  changeId: string;
  event: OptimizationChangeJournalEvent;
  occurredAt: string;
  ruleId: string;
  collector: string;
  projectId: string | null;
  source: OptimizationChangeSource;
  privacy: {
    metadataOnly: true;
    promptContentStored: false;
    codeContentStored: false;
    toolPayloadStored: false;
  };
}

export interface CreateChangeJournalEntryInput {
  event: OptimizationChangeJournalEvent;
  occurredAt: string;
  ruleId: string;
  collector: string;
  projectId?: string | null;
  source: OptimizationChangeSource;
  changeId?: string | null;
}

export interface ParsedChangeJournal {
  entries: OptimizationChangeJournalEntry[];
  warnings: string[];
}

export interface ChangeJournalWindows {
  changes: OptimizationChangeWindow[];
  warnings: string[];
}

const SAFE_ID = /^[a-zA-Z0-9_.:/-]{1,180}$/;
const DEFAULT_DIRECTORY = resolve(homedir(), ".config", "token-intelligence");
export const DEFAULT_CHANGE_JOURNAL_PATH = resolve(DEFAULT_DIRECTORY, "changes.jsonl");

function canonicalDate(value: string, field: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
  return parsed.toISOString();
}

function safeId(value: string, field: string): string {
  const trimmed = value.trim();
  if (!SAFE_ID.test(trimmed)) throw new Error(`${field} contains unsupported characters or is too long`);
  return trimmed;
}

function hashId(prefix: string, material: string): string {
  return `${prefix}_${createHash("sha256").update(material).digest("hex").slice(0, 24)}`;
}

export function createChangeJournalEntry(input: CreateChangeJournalEntryInput): OptimizationChangeJournalEntry {
  const occurredAt = canonicalDate(input.occurredAt, "occurredAt");
  const ruleId = safeId(input.ruleId, "ruleId");
  const collector = safeId(input.collector, "collector");
  const projectId = input.projectId === null || input.projectId === undefined ? null : safeId(input.projectId, "projectId");
  const generatedChangeId = hashId("change", `${ruleId}|${collector}|${projectId ?? "all"}|${occurredAt}`);
  const changeId = input.changeId ? safeId(input.changeId, "changeId") : generatedChangeId;
  if (input.event === "stopped" && !input.changeId) throw new Error("changeId is required for a stopped journal event");
  const eventId = hashId("change_event", `${changeId}|${input.event}|${occurredAt}`);
  return {
    schemaVersion: "1",
    eventId,
    changeId,
    event: input.event,
    occurredAt,
    ruleId,
    collector,
    projectId,
    source: input.source,
    privacy: {
      metadataOnly: true,
      promptContentStored: false,
      codeContentStored: false,
      toolPayloadStored: false,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseEntry(value: unknown): OptimizationChangeJournalEntry | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== "1" || (value.event !== "applied" && value.event !== "stopped")) return null;
  if (value.source !== "token_intelligence" && value.source !== "manual") return null;
  if (typeof value.eventId !== "string" || typeof value.changeId !== "string" || typeof value.ruleId !== "string" || typeof value.collector !== "string" || typeof value.occurredAt !== "string") return null;
  if (!SAFE_ID.test(value.eventId) || !SAFE_ID.test(value.changeId) || !SAFE_ID.test(value.ruleId) || !SAFE_ID.test(value.collector)) return null;
  if (value.projectId !== null && (typeof value.projectId !== "string" || !SAFE_ID.test(value.projectId))) return null;
  const timestamp = new Date(value.occurredAt);
  if (Number.isNaN(timestamp.getTime())) return null;
  return {
    schemaVersion: "1",
    eventId: value.eventId,
    changeId: value.changeId,
    event: value.event,
    occurredAt: timestamp.toISOString(),
    ruleId: value.ruleId,
    collector: value.collector,
    projectId: value.projectId as string | null,
    source: value.source,
    privacy: {
      metadataOnly: true,
      promptContentStored: false,
      codeContentStored: false,
      toolPayloadStored: false,
    },
  };
}

export function parseChangeJournalText(text: string): ParsedChangeJournal {
  const byEvent = new Map<string, OptimizationChangeJournalEntry>();
  const warnings: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    try {
      const entry = parseEntry(JSON.parse(raw));
      if (!entry) {
        warnings.push("One change-journal record was invalid and was skipped.");
        continue;
      }
      byEvent.set(entry.eventId, entry);
    } catch {
      warnings.push("One change-journal record could not be parsed and was skipped.");
    }
  }
  return {
    entries: [...byEvent.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId)),
    warnings,
  };
}

export async function readChangeJournal(path = DEFAULT_CHANGE_JOURNAL_PATH): Promise<ParsedChangeJournal> {
  try {
    return parseChangeJournalText(await readFile(resolve(path), "utf8"));
  } catch (error) {
    const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
    if (code === "ENOENT") return { entries: [], warnings: [] };
    throw error;
  }
}

export async function appendChangeJournalEntry(entry: OptimizationChangeJournalEntry, path = DEFAULT_CHANGE_JOURNAL_PATH): Promise<void> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  await appendFile(absolute, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
  try { await chmod(absolute, 0o600); } catch { /* Windows and some filesystems do not support POSIX modes. */ }
}

export function buildChangeWindows(entries: OptimizationChangeJournalEntry[]): ChangeJournalWindows {
  const warnings: string[] = [];
  const grouped = new Map<string, OptimizationChangeJournalEntry[]>();
  for (const entry of entries) grouped.set(entry.changeId, [...(grouped.get(entry.changeId) ?? []), entry]);
  const changes: OptimizationChangeWindow[] = [];

  for (const [changeId, group] of grouped) {
    const ordered = [...group].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
    const applied = ordered.find((entry) => entry.event === "applied");
    if (!applied) {
      warnings.push(`Change ${changeId} has no applied event and was skipped.`);
      continue;
    }
    const conflictingApplied = ordered.filter((entry) => entry.event === "applied" && entry.eventId !== applied.eventId);
    if (conflictingApplied.length) warnings.push(`Change ${changeId} has multiple applied events; the earliest valid event was used.`);
    const stopped = ordered.find((entry) => entry.event === "stopped" && entry.occurredAt > applied.occurredAt);
    const incompatible = ordered.some((entry) => entry.ruleId !== applied.ruleId || entry.collector !== applied.collector || entry.projectId !== applied.projectId);
    if (incompatible) {
      warnings.push(`Change ${changeId} contains inconsistent scope metadata and was skipped.`);
      continue;
    }
    changes.push({
      changeId,
      ruleId: applied.ruleId,
      appliedAt: applied.occurredAt,
      stoppedAt: stopped?.occurredAt ?? null,
      collector: applied.collector,
      projectId: applied.projectId,
      source: applied.source,
    });
  }

  return { changes: changes.sort((a, b) => a.appliedAt.localeCompare(b.appliedAt) || a.changeId.localeCompare(b.changeId)), warnings };
}
