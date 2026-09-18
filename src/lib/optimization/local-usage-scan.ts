import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { getCollector } from "@/lib/collectors/registry";
import type { CollectorName, CollectorParseResult } from "@/lib/collectors/types";
import { auditCollectorResult, type LocalAuditRecommendation, type LocalUsageAuditReport } from "@/lib/optimization/local-usage-audit";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

const HISTORY_EXTENSIONS = new Set([".jsonl", ".ndjson"]);
const severityRank: Record<LocalAuditRecommendation["severity"], number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

export interface LocalUsageScanOptions {
  collector: CollectorName;
  roots?: string[];
  projectId?: string | null;
  environment?: string;
  since?: Date | null;
  generatedAt?: string;
  homeDirectory?: string;
  maxFiles?: number;
}

export interface LocalUsageFindingGroup {
  ruleId: string;
  category: LocalAuditRecommendation["category"];
  severity: LocalAuditRecommendation["severity"];
  title: string;
  occurrences: number;
  affectedSessions: number;
  largestSingleFindingWasteTokens: number | null;
  largestSingleFindingWasteUsd: number | null;
}

export interface LocalUsageAggregate {
  sessions: number;
  runs: number;
  turns: number;
  llmCalls: number;
  toolCalls: number;
  freshInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  knownCostUsd: number | null;
  sessionsWithKnownCost: number;
  sessionsWithoutKnownCost: number;
  opportunity: {
    findingsWithTokenEstimate: number;
    largestSingleFindingWasteTokens: number | null;
    findingsWithUsdEstimate: number;
    largestSingleFindingWasteUsd: number | null;
    additiveSavingsClaimed: false;
  };
  findings: LocalUsageFindingGroup[];
}

export interface LocalUsageRollup extends LocalUsageAggregate {
  periodStart: string;
  periodEndExclusive: string;
}

export interface LocalUsageRankingItem {
  key: string;
  records: number;
  totalTokens: number;
  knownCostUsd: number | null;
  recordsWithKnownCost: number;
  recordsWithoutKnownCost: number;
}

export interface LocalUsageRunRankingItem {
  sessionId: string;
  runId: string;
  projectId: string | null;
  totalTokens: number;
  knownCostUsd: number;
}

export interface LocalUsageScanReport {
  version: 1;
  generatedAt: string;
  collector: CollectorName;
  window: {
    since: string | null;
    attribution: "session_end";
  };
  discovery: {
    automatic: boolean;
    rootsAttempted: number;
    filesDiscovered: number;
    filesParsed: number;
    filesFailed: number;
    duplicateSessionsCollapsed: number;
  };
  privacy: {
    localOnly: true;
    contentStored: false;
    rawPromptContentInspected: false;
    networkRequestsRequired: false;
    sourcePathsIncludedInReport: false;
  };
  overall: LocalUsageAggregate;
  rankings: {
    models: LocalUsageRankingItem[];
    projects: LocalUsageRankingItem[];
    priciestRuns: LocalUsageRunRankingItem[];
  };
  rollups: {
    daily: LocalUsageRollup[];
    weekly: LocalUsageRollup[];
    monthly: LocalUsageRollup[];
  };
  warnings: string[];
  limitations: string[];
}

interface ScannedSession {
  parsed: CollectorParseResult;
  audit: LocalUsageAuditReport;
  anchorAt: Date;
  sourceFileCount: number;
}

interface DiscoveryResult {
  automatic: boolean;
  roots: string[];
  files: string[];
  warnings: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countValue(value: unknown): number {
  const parsed = numberValue(value);
  return parsed === null ? 0 : Math.max(0, Math.trunc(parsed));
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function roundMoney(value: number) {
  return Math.round(value * 1e8) / 1e8;
}

function expandHome(path: string, home: string) {
  return path === "~" ? home : path.startsWith("~/") ? join(home, path.slice(2)) : path;
}

export function defaultCollectorHistoryRoots(collector: CollectorName, homeDirectory = homedir()): string[] {
  if (collector === "codex") return [join(homeDirectory, ".codex", "sessions")];
  if (collector === "claude") return [join(homeDirectory, ".claude", "projects")];
  // Cursor and Antigravity local storage is not advertised here because the existing
  // normalized collectors accept exported/provider-format JSONL rather than a stable,
  // repository-certified on-disk history location. Callers can pass an explicit root.
  return [];
}

async function walkDirectory(root: string, files: string[], maxFiles: number) {
  if (files.length >= maxFiles) return;
  const entries = await readdir(root, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (files.length >= maxFiles) return;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(path, files, maxFiles);
    } else if (entry.isFile() && HISTORY_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(path);
    }
  }
}

export async function discoverLocalUsageFiles(options: Pick<LocalUsageScanOptions, "collector" | "roots" | "homeDirectory" | "maxFiles">): Promise<DiscoveryResult> {
  const home = options.homeDirectory ?? homedir();
  const automatic = !(options.roots && options.roots.length);
  const configured = automatic ? defaultCollectorHistoryRoots(options.collector, home) : options.roots ?? [];
  const roots = configured.map((item) => resolve(expandHome(item, home)));
  const files: string[] = [];
  const warnings: string[] = [];
  const maxFiles = Math.max(1, options.maxFiles ?? 5_000);

  if (!roots.length) {
    warnings.push(`No repository-certified automatic history path is known for ${options.collector}; pass an explicit file or directory root.`);
    return { automatic, roots, files, warnings };
  }

  for (const root of roots) {
    try {
      const info = await stat(root);
      if (info.isFile()) {
        files.push(root);
      } else if (info.isDirectory()) {
        await walkDirectory(root, files, maxFiles);
      }
    } catch {
      warnings.push("One configured history root could not be read and was skipped.");
    }
    if (files.length >= maxFiles) {
      warnings.push(`History discovery stopped at the configured ${maxFiles.toLocaleString()} file safety limit.`);
      break;
    }
  }

  return { automatic, roots, files: [...new Set(files)].sort(), warnings };
}

function mergeParseResults(results: Array<{ parsed: CollectorParseResult; sourceFile: string }>) {
  const groups = new Map<string, Array<{ parsed: CollectorParseResult; sourceFile: string }>>();
  for (const result of results) {
    const key = `${result.parsed.collector}:${result.parsed.sessionId}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  return [...groups.values()].map((items) => {
    const first = items[0].parsed;
    const eventMap = new Map<string, TelemetryEventInput>();
    for (const item of items) {
      for (const event of item.parsed.events) {
        const key = `${event.eventType}:${event.sourceEventId}`;
        const previous = eventMap.get(key);
        if (!previous || event.occurredAt.getTime() >= previous.occurredAt.getTime()) eventMap.set(key, event);
      }
    }
    const parsed: CollectorParseResult = {
      collector: first.collector,
      sessionId: first.sessionId,
      usageClassification: items.some((item) => item.parsed.usageClassification === "agent_measured") ? "agent_measured" : "estimated",
      events: [...eventMap.values()].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.sourceEventId.localeCompare(b.sourceEventId)),
      warnings: [...new Set(items.flatMap((item) => item.parsed.warnings))].sort(),
      measuredFields: [...new Set(items.flatMap((item) => item.parsed.measuredFields))].sort(),
      estimatedFields: [...new Set(items.flatMap((item) => item.parsed.estimatedFields))].sort(),
      missingFields: [...new Set(items.flatMap((item) => item.parsed.missingFields))].sort(),
    };
    return { parsed, sourceFileCount: items.length };
  }).sort((a, b) => a.parsed.sessionId.localeCompare(b.parsed.sessionId));
}

function sessionAnchorAt(parsed: CollectorParseResult): Date {
  const runEvents = parsed.events.filter((event) => event.eventType === "run.upsert");
  const source = runEvents.length ? runEvents : parsed.events;
  if (!source.length) return new Date(0);
  return new Date(Math.max(...source.map((event) => event.occurredAt.getTime())));
}

function aggregateAudits(sessions: ScannedSession[]): LocalUsageAggregate {
  const audits = sessions.map((session) => session.audit);
  const knownCosts = audits.map((audit) => audit.summary.knownCostUsd).filter((value): value is number => value !== null);
  const recommendations = audits.flatMap((audit) => audit.recommendations.map((recommendation) => ({ audit, recommendation })));
  const tokenEstimates = recommendations.map(({ recommendation }) => recommendation.estimatedWasteTokens).filter((value): value is number => value !== null && value > 0);
  const usdEstimates = recommendations.map(({ recommendation }) => recommendation.estimatedWasteUsd).filter((value): value is number => value !== null && value > 0);

  const groups = new Map<string, { recommendation: LocalAuditRecommendation; sessions: Set<string>; occurrences: number; tokens: number[]; usd: number[] }>();
  for (const { audit, recommendation } of recommendations) {
    const current = groups.get(recommendation.ruleId) ?? { recommendation, sessions: new Set<string>(), occurrences: 0, tokens: [], usd: [] };
    current.sessions.add(audit.sessionId);
    current.occurrences += 1;
    if (recommendation.estimatedWasteTokens !== null && recommendation.estimatedWasteTokens > 0) current.tokens.push(recommendation.estimatedWasteTokens);
    if (recommendation.estimatedWasteUsd !== null && recommendation.estimatedWasteUsd > 0) current.usd.push(recommendation.estimatedWasteUsd);
    if (severityRank[recommendation.severity] > severityRank[current.recommendation.severity]) current.recommendation = recommendation;
    groups.set(recommendation.ruleId, current);
  }

  const findings: LocalUsageFindingGroup[] = [...groups.values()].map((group) => ({
    ruleId: group.recommendation.ruleId,
    category: group.recommendation.category,
    severity: group.recommendation.severity,
    title: group.recommendation.title,
    occurrences: group.occurrences,
    affectedSessions: group.sessions.size,
    largestSingleFindingWasteTokens: group.tokens.length ? Math.max(...group.tokens) : null,
    largestSingleFindingWasteUsd: group.usd.length ? Math.max(...group.usd) : null,
  })).sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.occurrences - a.occurrences || a.ruleId.localeCompare(b.ruleId));

  return {
    sessions: sessions.length,
    runs: audits.reduce((sum, audit) => sum + audit.summary.runs, 0),
    turns: audits.reduce((sum, audit) => sum + audit.summary.turns, 0),
    llmCalls: audits.reduce((sum, audit) => sum + audit.summary.llmCalls, 0),
    toolCalls: audits.reduce((sum, audit) => sum + audit.summary.toolCalls, 0),
    freshInputTokens: audits.reduce((sum, audit) => sum + audit.summary.freshInputTokens, 0),
    cacheReadTokens: audits.reduce((sum, audit) => sum + audit.summary.cacheReadTokens, 0),
    cacheWriteTokens: audits.reduce((sum, audit) => sum + audit.summary.cacheWriteTokens, 0),
    reasoningTokens: audits.reduce((sum, audit) => sum + audit.summary.reasoningTokens, 0),
    outputTokens: audits.reduce((sum, audit) => sum + audit.summary.outputTokens, 0),
    knownCostUsd: knownCosts.length ? roundMoney(knownCosts.reduce((sum, value) => sum + value, 0)) : null,
    sessionsWithKnownCost: knownCosts.length,
    sessionsWithoutKnownCost: audits.length - knownCosts.length,
    opportunity: {
      findingsWithTokenEstimate: tokenEstimates.length,
      largestSingleFindingWasteTokens: tokenEstimates.length ? Math.max(...tokenEstimates) : null,
      findingsWithUsdEstimate: usdEstimates.length,
      largestSingleFindingWasteUsd: usdEstimates.length ? Math.max(...usdEstimates) : null,
      additiveSavingsClaimed: false,
    },
    findings,
  };
}

function periodStart(date: Date, period: "day" | "week" | "month") {
  const value = new Date(date);
  if (period === "day") {
    value.setUTCHours(0, 0, 0, 0);
  } else if (period === "week") {
    value.setUTCHours(0, 0, 0, 0);
    const day = value.getUTCDay();
    value.setUTCDate(value.getUTCDate() - ((day + 6) % 7));
  } else {
    value.setUTCDate(1);
    value.setUTCHours(0, 0, 0, 0);
  }
  return value;
}

function periodEnd(start: Date, period: "day" | "week" | "month") {
  const value = new Date(start);
  if (period === "day") value.setUTCDate(value.getUTCDate() + 1);
  else if (period === "week") value.setUTCDate(value.getUTCDate() + 7);
  else value.setUTCMonth(value.getUTCMonth() + 1);
  return value;
}

function buildRollups(sessions: ScannedSession[], period: "day" | "week" | "month"): LocalUsageRollup[] {
  const buckets = new Map<string, { start: Date; sessions: ScannedSession[] }>();
  for (const session of sessions) {
    const start = periodStart(session.anchorAt, period);
    const key = start.toISOString();
    const bucket = buckets.get(key) ?? { start, sessions: [] };
    bucket.sessions.push(session);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.start.getTime() - b.start.getTime()).map((bucket) => ({
    periodStart: bucket.start.toISOString(),
    periodEndExclusive: periodEnd(bucket.start, period).toISOString(),
    ...aggregateAudits(bucket.sessions),
  }));
}

function eventTokenTotal(payload: Record<string, unknown>) {
  return countValue(payload.freshInputTokens) + countValue(payload.cacheReadTokens) + countValue(payload.cacheWriteTokens) + countValue(payload.reasoningTokens) + countValue(payload.outputTokens);
}

function buildRankings(sessions: ScannedSession[]) {
  const modelRecords = new Map<string, { records: number; totalTokens: number; knownCost: number; known: number; unknown: number }>();
  const projectRecords = new Map<string, { records: number; totalTokens: number; knownCost: number; known: number; unknown: number }>();
  const runRecords = new Map<string, LocalUsageRunRankingItem>();

  for (const session of sessions) {
    for (const event of session.parsed.events) {
      const payload = asRecord(event.payload);
      if (event.eventType === "turn.upsert") {
        const model = stringValue(payload.modelResolved) ?? stringValue(payload.modelRequested);
        if (model) {
          const current = modelRecords.get(model) ?? { records: 0, totalTokens: 0, knownCost: 0, known: 0, unknown: 0 };
          const cost = numberValue(payload.costUsd);
          current.records += 1;
          current.totalTokens += eventTokenTotal(payload);
          if (cost === null) current.unknown += 1;
          else { current.known += 1; current.knownCost += cost; }
          modelRecords.set(model, current);
        }
      }

      if (event.eventType === "run.upsert") {
        const runId = stringValue(payload.id) ?? stringValue(event.runId);
        if (!runId) continue;
        const projectId = stringValue(event.projectId) ?? stringValue(payload.projectId);
        const cost = firstNumber(payload.reconciledCostUsd, payload.actualCostUsd, payload.estimatedCostUsd);
        const totalTokens = eventTokenTotal(payload);
        if (projectId) {
          const current = projectRecords.get(projectId) ?? { records: 0, totalTokens: 0, knownCost: 0, known: 0, unknown: 0 };
          current.records += 1;
          current.totalTokens += totalTokens;
          if (cost === null) current.unknown += 1;
          else { current.known += 1; current.knownCost += cost; }
          projectRecords.set(projectId, current);
        }
        if (cost !== null) {
          runRecords.set(`${session.parsed.sessionId}:${runId}`, { sessionId: session.parsed.sessionId, runId, projectId, totalTokens, knownCostUsd: roundMoney(cost) });
        }
      }
    }
  }

  const normalize = (records: Map<string, { records: number; totalTokens: number; knownCost: number; known: number; unknown: number }>): LocalUsageRankingItem[] => [...records.entries()].map(([key, value]) => ({
    key,
    records: value.records,
    totalTokens: value.totalTokens,
    knownCostUsd: value.known ? roundMoney(value.knownCost) : null,
    recordsWithKnownCost: value.known,
    recordsWithoutKnownCost: value.unknown,
  })).sort((a, b) => (b.knownCostUsd ?? -1) - (a.knownCostUsd ?? -1) || b.totalTokens - a.totalTokens || a.key.localeCompare(b.key)).slice(0, 10);

  return {
    models: normalize(modelRecords),
    projects: normalize(projectRecords),
    priciestRuns: [...runRecords.values()].sort((a, b) => b.knownCostUsd - a.knownCostUsd || b.totalTokens - a.totalTokens || a.runId.localeCompare(b.runId)).slice(0, 10),
  };
}

export async function scanLocalUsage(options: LocalUsageScanOptions): Promise<LocalUsageScanReport> {
  const collector = getCollector(options.collector);
  if (!collector) throw new Error(`Unknown collector ${options.collector}`);

  const discovery = await discoverLocalUsageFiles(options);
  const parsedFiles: Array<{ parsed: CollectorParseResult; sourceFile: string }> = [];
  const warnings = [...discovery.warnings];
  let failedFiles = 0;

  for (const file of discovery.files) {
    try {
      const text = await readFile(file, "utf8");
      const parsed = collector.parseJsonLines(text.split(/\r?\n/), { projectId: options.projectId, environment: options.environment ?? "development" });
      if (!parsed.events.length) {
        failedFiles += 1;
        warnings.push("One discovered history file produced no normalized events and was skipped.");
        continue;
      }
      parsedFiles.push({ parsed, sourceFile: file });
    } catch {
      failedFiles += 1;
      warnings.push("One discovered history file could not be parsed and was skipped.");
    }
  }

  const merged = mergeParseResults(parsedFiles);
  const cutoff = options.since ?? null;
  const sessions: ScannedSession[] = merged.map(({ parsed, sourceFileCount }) => {
    const anchorAt = sessionAnchorAt(parsed);
    return { parsed, sourceFileCount, anchorAt, audit: auditCollectorResult(parsed, { generatedAt: options.generatedAt }) };
  }).filter((session) => !cutoff || session.anchorAt.getTime() >= cutoff.getTime());

  const duplicateSessionsCollapsed = merged.reduce((sum, session) => sum + Math.max(0, session.sourceFileCount - 1), 0);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const overall = aggregateAudits(sessions);

  return {
    version: 1,
    generatedAt,
    collector: options.collector,
    window: { since: cutoff ? cutoff.toISOString() : null, attribution: "session_end" },
    discovery: {
      automatic: discovery.automatic,
      rootsAttempted: discovery.roots.length,
      filesDiscovered: discovery.files.length,
      filesParsed: parsedFiles.length,
      filesFailed: failedFiles,
      duplicateSessionsCollapsed,
    },
    privacy: {
      localOnly: true,
      contentStored: false,
      rawPromptContentInspected: false,
      networkRequestsRequired: false,
      sourcePathsIncludedInReport: false,
    },
    overall,
    rankings: buildRankings(sessions),
    rollups: {
      daily: buildRollups(sessions, "day"),
      weekly: buildRollups(sessions, "week"),
      monthly: buildRollups(sessions, "month"),
    },
    warnings: [...new Set([...warnings, ...sessions.flatMap((session) => session.parsed.warnings)])],
    limitations: [
      "Daily, weekly, and monthly rollups attribute each parsed session to its normalized run/session end time; cumulative run totals are never split across buckets.",
      "Known cost is summed only where a collector supplied a cost receipt; missing cost remains unknown rather than being treated as zero.",
      "Opportunity estimates from different findings can overlap. The scan reports largest individually supported opportunities and never claims an additive savings total.",
      "Automatic local-history discovery is advertised only for repository-certified paths/formats. Other collectors require an explicit file or directory root.",
      "Provider-format fixture coverage does not prove compatibility with every real user history layout.",
    ],
  };
}

function formatMoney(value: number | null) {
  return value === null ? "unknown" : `$${value.toFixed(4)}`;
}

function formatRollupLine(rollup: LocalUsageRollup) {
  return `${rollup.periodStart.slice(0, 10)}  sessions=${rollup.sessions.toLocaleString()}  tokens=${(rollup.freshInputTokens + rollup.cacheReadTokens + rollup.cacheWriteTokens + rollup.reasoningTokens + rollup.outputTokens).toLocaleString()}  knownCost=${formatMoney(rollup.knownCostUsd)}`;
}

export function formatLocalUsageScanReport(report: LocalUsageScanReport) {
  const totalTokens = report.overall.freshInputTokens + report.overall.cacheReadTokens + report.overall.cacheWriteTokens + report.overall.reasoningTokens + report.overall.outputTokens;
  const lines = [
    "Token Intelligence local history scan",
    `Source: ${report.collector}`,
    `Window: ${report.window.since ? `sessions ending on/after ${report.window.since}` : "all discovered sessions"}`,
    `Discovery: ${report.discovery.filesDiscovered.toLocaleString()} files, ${report.overall.sessions.toLocaleString()} deduplicated sessions, ${report.discovery.duplicateSessionsCollapsed.toLocaleString()} duplicate copies collapsed`,
    `Usage: ${report.overall.runs.toLocaleString()} runs, ${report.overall.turns.toLocaleString()} turns, ${totalTokens.toLocaleString()} tokens`,
    `Token mix: fresh=${report.overall.freshInputTokens.toLocaleString()} cache-read=${report.overall.cacheReadTokens.toLocaleString()} cache-write=${report.overall.cacheWriteTokens.toLocaleString()} reasoning=${report.overall.reasoningTokens.toLocaleString()} output=${report.overall.outputTokens.toLocaleString()}`,
    `Known cost: ${formatMoney(report.overall.knownCostUsd)} (${report.overall.sessionsWithKnownCost.toLocaleString()} sessions known; ${report.overall.sessionsWithoutKnownCost.toLocaleString()} unknown)`,
    `Largest single token opportunity: ${report.overall.opportunity.largestSingleFindingWasteTokens?.toLocaleString() ?? "unknown"}`,
    `Largest single dollar opportunity: ${formatMoney(report.overall.opportunity.largestSingleFindingWasteUsd)}`,
    "Savings note: findings can overlap; this report does not add them into a headline savings total.",
    "Privacy: local-only normalized metadata analysis; no prompt/code/transcript content is stored or sent, and source paths are omitted from the report.",
  ];

  if (report.overall.findings.length) {
    lines.push("", "Top findings:");
    for (const finding of report.overall.findings.slice(0, 10)) {
      lines.push(`- [${finding.severity}] ${finding.title} — ${finding.occurrences.toLocaleString()} occurrence(s) across ${finding.affectedSessions.toLocaleString()} session(s)`);
    }
  }
  if (report.rankings.models.length) {
    lines.push("", "Model usage:");
    for (const model of report.rankings.models.slice(0, 10)) lines.push(`- ${model.key}: ${model.totalTokens.toLocaleString()} tokens, known cost ${formatMoney(model.knownCostUsd)}`);
  }
  if (report.rollups.daily.length) {
    lines.push("", "Daily rollup:");
    for (const rollup of report.rollups.daily.slice(-14)) lines.push(`- ${formatRollupLine(rollup)}`);
  }
  if (report.warnings.length) {
    lines.push("", "Warnings:");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
