import { createHash } from "node:crypto";
import type { CollectorParseResult } from "@/lib/collectors/types";
import type { TelemetryEventInput } from "@/lib/telemetry/schemas";

export type SessionCacheRiskState = "unknown" | "quiet" | "healthy" | "warning" | "expired";
export type SessionCacheRiskAction = "unknown" | "continue" | "prepare_handoff" | "handoff_now";
export type CacheAnchorEvidence =
  | "cache_write_5m"
  | "cache_write_1h"
  | "cache_read_refresh_after_known_write"
  | "mixed_ttl_write"
  | "none";

export interface SessionCacheRiskPolicy {
  warningLeadSeconds: number;
  minContextTokens: number | null;
  minCostUsd: number | null;
}

export const DEFAULT_SESSION_CACHE_RISK_POLICY: SessionCacheRiskPolicy = {
  // Product policy, not a claim that every provider has a five-minute warning window.
  warningLeadSeconds: 5 * 60,
  // The Oct 8, 2026 donor discussion used 50k tokens / $0.50 as its noise budget.
  // Callers can override both; these are intervention thresholds, not provider facts.
  minContextTokens: 50_000,
  minCostUsd: 0.5,
};

export interface SessionCacheRiskInput {
  sessionId: string;
  provider: string | null;
  now: Date | string;
  cacheAnchorAt: Date | string | null;
  cacheTtlSeconds: number | null;
  anchorEvidence: CacheAnchorEvidence;
  contextInputTokens: number | null;
  costUsd: number | null;
  costBasis?: "provider_measured" | "api_equivalent_estimate" | "unknown";
  policy?: Partial<SessionCacheRiskPolicy>;
}

export interface SessionCacheRiskReport {
  version: 1;
  sessionId: string;
  provider: string | null;
  state: SessionCacheRiskState;
  action: SessionCacheRiskAction;
  now: string;
  cacheAnchorAt: string | null;
  cacheExpiresAt: string | null;
  cacheTtlSeconds: number | null;
  secondsUntilExpiry: number | null;
  warningLeadSeconds: number;
  anchorEvidence: CacheAnchorEvidence;
  alertKey: string | null;
  materiality: {
    contextInputTokens: number | null;
    minContextTokens: number | null;
    costUsd: number | null;
    minCostUsd: number | null;
    costBasis: "provider_measured" | "api_equivalent_estimate" | "unknown";
    crossedBy: Array<"context" | "cost">;
  };
  reasons: string[];
  limitations: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeNumber(value: unknown): number {
  const parsed = finiteNumber(value);
  return parsed === null ? 0 : Math.max(0, parsed);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeThreshold(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function policyWithDefaults(policy?: Partial<SessionCacheRiskPolicy>): SessionCacheRiskPolicy {
  return {
    warningLeadSeconds: Math.max(0, Math.trunc(policy?.warningLeadSeconds ?? DEFAULT_SESSION_CACHE_RISK_POLICY.warningLeadSeconds)),
    minContextTokens: policy?.minContextTokens === undefined
      ? DEFAULT_SESSION_CACHE_RISK_POLICY.minContextTokens
      : normalizeThreshold(policy.minContextTokens),
    minCostUsd: policy?.minCostUsd === undefined
      ? DEFAULT_SESSION_CACHE_RISK_POLICY.minCostUsd
      : normalizeThreshold(policy.minCostUsd),
  };
}

function stableAlertKey(sessionId: string, anchorAt: string, ttlSeconds: number) {
  return `cache_${createHash("sha256").update(`${sessionId}|${anchorAt}|${ttlSeconds}`).digest("hex").slice(0, 20)}`;
}

function unknownReport(input: SessionCacheRiskInput, now: Date, policy: SessionCacheRiskPolicy, reasons: string[]): SessionCacheRiskReport {
  return {
    version: 1,
    sessionId: input.sessionId,
    provider: input.provider,
    state: "unknown",
    action: "unknown",
    now: now.toISOString(),
    cacheAnchorAt: null,
    cacheExpiresAt: null,
    cacheTtlSeconds: null,
    secondsUntilExpiry: null,
    warningLeadSeconds: policy.warningLeadSeconds,
    anchorEvidence: input.anchorEvidence,
    alertKey: null,
    materiality: {
      contextInputTokens: input.contextInputTokens,
      minContextTokens: policy.minContextTokens,
      costUsd: input.costUsd,
      minCostUsd: policy.minCostUsd,
      costBasis: input.costBasis ?? "unknown",
      crossedBy: [],
    },
    reasons,
    limitations: [
      "No cache deadline is claimed without an evidence-backed cache interaction anchor and TTL.",
      "API-equivalent cost is an optimization yardstick unless provider-measured billing evidence says otherwise.",
      "This evaluator only recommends an action class; it never sends keepalive messages or modifies provider sessions.",
    ],
  };
}

export function evaluateSessionCacheRisk(input: SessionCacheRiskInput): SessionCacheRiskReport {
  const now = validDate(input.now);
  if (!now) throw new Error("now must be a valid date");
  const policy = policyWithDefaults(input.policy);
  const anchor = validDate(input.cacheAnchorAt);
  const ttlSeconds = normalizeThreshold(input.cacheTtlSeconds);

  if (!anchor || ttlSeconds === null || ttlSeconds <= 0 || input.anchorEvidence === "none" || input.anchorEvidence === "mixed_ttl_write") {
    const reason = input.anchorEvidence === "mixed_ttl_write"
      ? "The normalized cache history contains mixed TTL classes, so a single expiry deadline would be misleading."
      : "A supported cache anchor and positive TTL are not both available.";
    return unknownReport(input, now, policy, [reason]);
  }

  const anchorIso = anchor.toISOString();
  const expires = new Date(anchor.getTime() + ttlSeconds * 1_000);
  const secondsUntilExpiry = Math.ceil((expires.getTime() - now.getTime()) / 1_000);
  const crossedBy: Array<"context" | "cost"> = [];
  if (policy.minContextTokens !== null && input.contextInputTokens !== null && input.contextInputTokens >= policy.minContextTokens) crossedBy.push("context");
  if (policy.minCostUsd !== null && input.costUsd !== null && input.costUsd >= policy.minCostUsd) crossedBy.push("cost");
  const gateConfigured = policy.minContextTokens !== null || policy.minCostUsd !== null;
  const material = !gateConfigured || crossedBy.length > 0;

  let state: SessionCacheRiskState;
  let action: SessionCacheRiskAction;
  const reasons: string[] = [];
  if (!material) {
    state = "quiet";
    action = "continue";
    reasons.push("No observed materiality signal crossed the configured interruption threshold.");
  } else if (secondsUntilExpiry <= 0) {
    state = "expired";
    action = "handoff_now";
    reasons.push("The evidence-backed cache horizon has passed for this idle stretch.");
  } else if (secondsUntilExpiry <= policy.warningLeadSeconds) {
    state = "warning";
    action = "prepare_handoff";
    reasons.push("The evidence-backed cache horizon is inside the configured warning lead.");
  } else {
    state = "healthy";
    action = "continue";
    reasons.push("The evidence-backed cache horizon remains outside the configured warning lead.");
  }

  if (crossedBy.includes("context")) reasons.push("Observed input-side context crossed the configured token threshold.");
  if (crossedBy.includes("cost")) reasons.push("Observed cost crossed the configured cost threshold.");

  return {
    version: 1,
    sessionId: input.sessionId,
    provider: input.provider,
    state,
    action,
    now: now.toISOString(),
    cacheAnchorAt: anchorIso,
    cacheExpiresAt: expires.toISOString(),
    cacheTtlSeconds: ttlSeconds,
    secondsUntilExpiry,
    warningLeadSeconds: policy.warningLeadSeconds,
    anchorEvidence: input.anchorEvidence,
    alertKey: stableAlertKey(input.sessionId, anchorIso, ttlSeconds),
    materiality: {
      contextInputTokens: input.contextInputTokens,
      minContextTokens: policy.minContextTokens,
      costUsd: input.costUsd,
      minCostUsd: policy.minCostUsd,
      costBasis: input.costBasis ?? "unknown",
      crossedBy,
    },
    reasons,
    limitations: [
      "The horizon is a normalized local observation, not a provider guarantee that every cached prefix shares one TTL.",
      "Mixed 5-minute and 1-hour cache histories are refused as a single timer because their economic impact cannot be reconstructed safely from aggregate cache-read tokens.",
      "API-equivalent cost is an optimization yardstick unless provider-measured billing evidence says otherwise.",
      "This evaluator only recommends an action class; it never sends keepalive messages or modifies provider sessions.",
    ],
  };
}

function eventTurnStartMap(events: TelemetryEventInput[]) {
  const starts = new Map<string, Date>();
  for (const event of events) {
    if (event.eventType !== "turn.upsert") continue;
    const payload = asRecord(event.payload);
    const id = stringValue(payload.id);
    const startedAt = validDate(payload.startedAt as Date | string | null | undefined);
    if (id && startedAt) starts.set(id, startedAt);
  }
  return starts;
}

function eventInputTokens(payload: Record<string, unknown>) {
  return nonNegativeNumber(payload.freshInputTokens) + nonNegativeNumber(payload.cacheReadTokens) + nonNegativeNumber(payload.cacheWriteTokens);
}

function eventCostBasis(payload: Record<string, unknown>): "provider_measured" | "api_equivalent_estimate" | "unknown" {
  const source = stringValue(payload.costSource);
  if (source === "provider_measured") return "provider_measured";
  if (finiteNumber(payload.costUsd) !== null) return "api_equivalent_estimate";
  return "unknown";
}

export interface CollectorCacheRiskOptions {
  now?: Date | string;
  policy?: Partial<SessionCacheRiskPolicy>;
}

/**
 * Derive a cache horizon only from normalized metadata already produced by a collector.
 * Claude's collector preserves the 5m/1h write classes in metadata. Cache reads refresh
 * the last unambiguous TTL class because Anthropic documents lifetime refresh on cache use.
 * If the normalized evidence becomes mixed/ambiguous, we deliberately return `unknown`.
 */
export function deriveSessionCacheRiskFromCollector(parsed: CollectorParseResult, options: CollectorCacheRiskOptions = {}): SessionCacheRiskReport {
  const events = [...parsed.events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.sourceEventId.localeCompare(b.sourceEventId));
  const turnStarts = eventTurnStartMap(events);
  const seenTtlClasses = new Set<number>();
  let knownTtlSeconds: number | null = null;
  let latestInputTokens: number | null = null;
  let latestCostUsd: number | null = null;
  let latestCostBasis: "provider_measured" | "api_equivalent_estimate" | "unknown" = "unknown";
  let latestProvider: string | null = null;
  let latestAnchorAt: Date | null = null;
  let latestEvidence: CacheAnchorEvidence = "none";
  let sawCacheInteraction = false;

  for (const event of events) {
    if (event.eventType !== "llm_call.recorded") continue;
    const payload = asRecord(event.payload);
    const metadata = asRecord(payload.metadata);
    const write5m = nonNegativeNumber(metadata.cacheWrite5mTokens);
    const write1h = nonNegativeNumber(metadata.cacheWrite1hTokens);
    const cacheRead = nonNegativeNumber(payload.cacheReadTokens);
    if (write5m <= 0 && write1h <= 0 && cacheRead <= 0) continue;

    sawCacheInteraction = true;
    const turnId = stringValue(payload.turnId);
    const requestStart = (turnId ? turnStarts.get(turnId) : null)
      ?? validDate(payload.startedAt as Date | string | null | undefined)
      ?? event.occurredAt;
    latestProvider = stringValue(payload.provider) ?? latestProvider;
    latestInputTokens = eventInputTokens(payload);
    latestCostUsd = finiteNumber(payload.costUsd);
    latestCostBasis = eventCostBasis(payload);

    if (write5m > 0) seenTtlClasses.add(5 * 60);
    if (write1h > 0) seenTtlClasses.add(60 * 60);
    if (seenTtlClasses.size > 1) {
      knownTtlSeconds = null;
      latestAnchorAt = null;
      latestEvidence = "mixed_ttl_write";
      continue;
    }
    if (write1h > 0) {
      knownTtlSeconds = 60 * 60;
      latestAnchorAt = requestStart;
      latestEvidence = "cache_write_1h";
      continue;
    }
    if (write5m > 0) {
      knownTtlSeconds = 5 * 60;
      latestAnchorAt = requestStart;
      latestEvidence = "cache_write_5m";
      continue;
    }
    if (cacheRead > 0 && knownTtlSeconds !== null) {
      latestAnchorAt = requestStart;
      latestEvidence = "cache_read_refresh_after_known_write";
    }
  }

  const now = options.now ?? new Date();
  if (!sawCacheInteraction) {
    return evaluateSessionCacheRisk({
      sessionId: parsed.sessionId,
      provider: null,
      now,
      cacheAnchorAt: null,
      cacheTtlSeconds: null,
      anchorEvidence: "none",
      contextInputTokens: null,
      costUsd: null,
      costBasis: "unknown",
      policy: options.policy,
    });
  }

  return evaluateSessionCacheRisk({
    sessionId: parsed.sessionId,
    provider: latestProvider,
    now,
    cacheAnchorAt: latestAnchorAt,
    cacheTtlSeconds: knownTtlSeconds,
    anchorEvidence: latestEvidence,
    contextInputTokens: latestInputTokens,
    costUsd: latestCostUsd,
    costBasis: latestCostBasis,
    policy: options.policy,
  });
}

export function formatSessionCacheRiskReport(report: SessionCacheRiskReport) {
  const lines = [
    "Token Intelligence session cache risk",
    `Session: ${report.sessionId}`,
    `Provider: ${report.provider ?? "unknown"}`,
    `State: ${report.state}`,
    `Action: ${report.action}`,
    `Anchor evidence: ${report.anchorEvidence}`,
    `Cache anchor: ${report.cacheAnchorAt ?? "unknown"}`,
    `Cache expiry: ${report.cacheExpiresAt ?? "unknown"}`,
    `Seconds until expiry: ${report.secondsUntilExpiry ?? "unknown"}`,
    `Input-side context: ${report.materiality.contextInputTokens?.toLocaleString() ?? "unknown"} tokens`,
    `Cost signal: ${report.materiality.costUsd === null ? "unknown" : `$${report.materiality.costUsd.toFixed(4)}`} (${report.materiality.costBasis})`,
    `Alert key: ${report.alertKey ?? "none"}`,
  ];
  if (report.reasons.length) lines.push("", "Reasons:", ...report.reasons.map((reason) => `- ${reason}`));
  if (report.limitations.length) lines.push("", "Limitations:", ...report.limitations.map((item) => `- ${item}`));
  return `${lines.join("\n")}\n`;
}
