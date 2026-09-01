import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

export type CollectorName = "codex" | "claude" | "cursor" | "antigravity";

export interface CollectorCapability {
  name: CollectorName;
  available: boolean;
  measuredUsage: boolean;
  liveWatch: boolean;
  historicalSync: boolean;
  reason?: string;
}

export interface CollectorContext {
  projectId?: string | null;
  repo?: string | null;
  branch?: string | null;
  repoCommitSha?: string | null;
  environment?: string;
}

export interface CollectorParseResult {
  collector: CollectorName;
  sourceFile?: string;
  sessionId: string;
  usageClassification: "agent_measured" | "estimated";
  events: TelemetryEventInput[];
  warnings: string[];
  measuredFields: string[];
  estimatedFields: string[];
  missingFields: string[];
}

export interface CollectorAdapter {
  readonly name: CollectorName;
  capability(): Promise<CollectorCapability>;
  parseJsonLines(lines: string[], context?: CollectorContext): CollectorParseResult;
}

export function safeRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseJsonLine(line: string): Record<string, unknown> | null {
  try { return safeRecord(JSON.parse(line)); } catch { return null; }
}
