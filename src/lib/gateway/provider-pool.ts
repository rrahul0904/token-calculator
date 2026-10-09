export const ROUTE_DECISION_ALGORITHM_VERSION = "provider-pool/v1" as const;

export type GatewayCapability =
  | "chat"
  | "streaming"
  | "tools"
  | "structured_output"
  | "vision";

export type CapabilitySupport = "supported" | "unsupported" | "unknown";
export type ProviderHealthStatus = "healthy" | "degraded" | "cooling_down" | "unavailable" | "unknown";
export type ProviderConnectionStatus = "verified" | "unverified" | "disabled";
export type ProviderQuotaEnforcement = "required" | "advisory" | "disabled";
export type ProviderQuotaMetric = "rpm" | "rpd" | "tpm" | "tpd";
export type ProviderQuotaObservationSource =
  | "provider_api"
  | "response_headers"
  | "error_signal"
  | "configured"
  | "inferred"
  | "unknown";
export type ProviderCatalogStatus = "active" | "retired" | "unknown";

export type RouteExclusionReasonCode =
  | "TENANT_MISMATCH"
  | "CONNECTION_NOT_VERIFIED"
  | "POLICY_DENIED"
  | "EXACT_ROUTE_MISMATCH"
  | "CAPABILITY_UNSUPPORTED"
  | "CAPABILITY_UNKNOWN"
  | "CATALOG_RETIRED"
  | "CATALOG_STATUS_UNKNOWN"
  | "HEALTH_COOLING_DOWN"
  | "HEALTH_PROBE_REQUIRED"
  | "HEALTH_STALE"
  | "HEALTH_UNAVAILABLE"
  | "HEALTH_UNKNOWN"
  | "QUOTA_EXHAUSTED"
  | "QUOTA_UNKNOWN"
  | "QUOTA_PROVENANCE_UNTRUSTED";

export interface RouteExclusionReason {
  code: RouteExclusionReasonCode;
  capability?: GatewayCapability;
  quotaMetric?: ProviderQuotaMetric;
}

export interface ProviderHealthSnapshot {
  snapshotId: string;
  status: ProviderHealthStatus;
  observedAtEpochMs: number | null;
  maxAgeMs: number | null;
  cooldownUntil?: string | null;
}

export interface ProviderQuotaSnapshot {
  snapshotId: string;
  enforcement: ProviderQuotaEnforcement;
  limits: Partial<Record<ProviderQuotaMetric, number | null>>;
  used: Partial<Record<ProviderQuotaMetric, number | null>>;
  sourceByMetric: Partial<Record<ProviderQuotaMetric, ProviderQuotaObservationSource>>;
}

export interface ProviderRouteCandidate {
  organizationId: string;
  providerConnectionId: string;
  provider: string;
  model: string;
  connectionStatus: ProviderConnectionStatus;
  policyAllowed: boolean;
  priority: number;
  capabilities: Partial<Record<GatewayCapability, CapabilitySupport>>;
  catalogStatus: ProviderCatalogStatus;
  health: ProviderHealthSnapshot;
  quota: ProviderQuotaSnapshot;
  catalogSnapshotId: string;
}

export interface ExactProviderRoute {
  providerConnectionId: string;
  model: string;
}

export interface ProviderRouteRequest {
  organizationId: string;
  requiredCapabilities: readonly GatewayCapability[];
  estimatedInputTokens: number;
  maxOutputTokens?: number;
  nowEpochMs: number;
  candidateSnapshotId: string;
  exactRoute?: ExactProviderRoute;
  allowCooldownProbe?: boolean;
}

export interface ProviderRouteCandidateRef {
  providerConnectionId: string;
  provider: string;
  model: string;
}

export interface ProviderRouteCandidateEvaluation {
  candidate: ProviderRouteCandidateRef;
  eligible: boolean;
  exclusionReasons: readonly RouteExclusionReason[];
  probeRequired: boolean;
  quotaPressure: number | null;
  healthSnapshotId: string;
  quotaSnapshotId: string;
  catalogSnapshotId: string;
}

export interface ProviderRouteDecision {
  algorithmVersion: typeof ROUTE_DECISION_ALGORITHM_VERSION;
  candidateSnapshotId: string;
  decidedAtEpochMs: number;
  requiredCapabilities: readonly GatewayCapability[];
  exactRoute: ExactProviderRoute | null;
  selected: (ProviderRouteCandidateRef & {
    reason: "eligible_best_ranked";
    probeRequired: boolean;
  }) | null;
  considered: readonly ProviderRouteCandidateEvaluation[];
}

const QUOTA_METRICS: readonly ProviderQuotaMetric[] = ["rpm", "rpd", "tpm", "tpd"];
const TRUSTED_QUOTA_SOURCES = new Set<ProviderQuotaObservationSource>([
  "provider_api",
  "response_headers",
  "error_signal",
  "configured",
]);

function finiteNonNegative(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function positiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function candidateRef(candidate: ProviderRouteCandidate): ProviderRouteCandidateRef {
  return {
    providerConnectionId: candidate.providerConnectionId,
    provider: candidate.provider,
    model: candidate.model,
  };
}

function requiredQuota(request: ProviderRouteRequest): Record<ProviderQuotaMetric, number> {
  const input = Math.max(0, Math.trunc(request.estimatedInputTokens));
  const output = Math.max(0, Math.trunc(request.maxOutputTokens ?? 0));
  const tokenReservation = Math.max(1, input + output);
  return {
    rpm: 1,
    rpd: 1,
    tpm: tokenReservation,
    tpd: tokenReservation,
  };
}

function quotaPressure(candidate: ProviderRouteCandidate): number | null {
  const pressures: number[] = [];
  for (const metric of QUOTA_METRICS) {
    const limit = candidate.quota.limits[metric];
    const used = candidate.quota.used[metric];
    const source = candidate.quota.sourceByMetric[metric] ?? "unknown";
    if (!TRUSTED_QUOTA_SOURCES.has(source)) continue;
    if (!finiteNonNegative(limit) || limit === 0 || !finiteNonNegative(used)) continue;
    pressures.push(used / limit);
  }
  return pressures.length ? Math.max(...pressures) : null;
}

function healthIsFresh(candidate: ProviderRouteCandidate, request: ProviderRouteRequest): boolean {
  const observedAt = candidate.health.observedAtEpochMs;
  const maxAge = candidate.health.maxAgeMs;
  return finiteNonNegative(observedAt)
    && positiveFinite(maxAge)
    && request.nowEpochMs >= observedAt
    && request.nowEpochMs - observedAt <= maxAge;
}

function healthReasons(
  candidate: ProviderRouteCandidate,
  request: ProviderRouteRequest,
): { reasons: RouteExclusionReason[]; probeRequired: boolean } {
  switch (candidate.health.status) {
    case "healthy":
    case "degraded":
      return healthIsFresh(candidate, request)
        ? { reasons: [], probeRequired: false }
        : { reasons: [{ code: "HEALTH_STALE" }], probeRequired: true };
    case "unavailable":
      return { reasons: [{ code: "HEALTH_UNAVAILABLE" }], probeRequired: false };
    case "unknown":
      return { reasons: [{ code: "HEALTH_UNKNOWN" }], probeRequired: false };
    case "cooling_down": {
      const until = candidate.health.cooldownUntil ? Date.parse(candidate.health.cooldownUntil) : Number.NaN;
      if (!Number.isFinite(until) || request.nowEpochMs < until) {
        return { reasons: [{ code: "HEALTH_COOLING_DOWN" }], probeRequired: false };
      }
      if (request.allowCooldownProbe === true) {
        return { reasons: [], probeRequired: true };
      }
      return { reasons: [{ code: "HEALTH_PROBE_REQUIRED" }], probeRequired: true };
    }
  }
}

function capabilityReasons(candidate: ProviderRouteCandidate, request: ProviderRouteRequest): RouteExclusionReason[] {
  const reasons: RouteExclusionReason[] = [];
  for (const capability of request.requiredCapabilities) {
    const support = candidate.capabilities[capability] ?? "unknown";
    if (support === "unsupported") {
      reasons.push({ code: "CAPABILITY_UNSUPPORTED", capability });
    } else if (support !== "supported") {
      reasons.push({ code: "CAPABILITY_UNKNOWN", capability });
    }
  }
  return reasons;
}

function catalogReasons(candidate: ProviderRouteCandidate): RouteExclusionReason[] {
  if (candidate.catalogStatus === "retired") return [{ code: "CATALOG_RETIRED" }];
  if (candidate.catalogStatus !== "active") return [{ code: "CATALOG_STATUS_UNKNOWN" }];
  return [];
}

function quotaReasons(candidate: ProviderRouteCandidate, request: ProviderRouteRequest): RouteExclusionReason[] {
  if (candidate.quota.enforcement === "disabled") return [];
  const needed = requiredQuota(request);
  const reasons: RouteExclusionReason[] = [];

  for (const metric of QUOTA_METRICS) {
    const limit = candidate.quota.limits[metric];
    const used = candidate.quota.used[metric];
    const source = candidate.quota.sourceByMetric[metric] ?? "unknown";

    if (!TRUSTED_QUOTA_SOURCES.has(source)) {
      if (candidate.quota.enforcement === "required") {
        reasons.push({ code: "QUOTA_PROVENANCE_UNTRUSTED", quotaMetric: metric });
      }
      continue;
    }
    if (!finiteNonNegative(limit) || !finiteNonNegative(used)) {
      if (candidate.quota.enforcement === "required") {
        reasons.push({ code: "QUOTA_UNKNOWN", quotaMetric: metric });
      }
      continue;
    }
    if (used + needed[metric] > limit) {
      reasons.push({ code: "QUOTA_EXHAUSTED", quotaMetric: metric });
    }
  }

  return reasons;
}

function evaluateCandidate(candidate: ProviderRouteCandidate, request: ProviderRouteRequest): ProviderRouteCandidateEvaluation {
  const reasons: RouteExclusionReason[] = [];

  if (candidate.organizationId !== request.organizationId) {
    reasons.push({ code: "TENANT_MISMATCH" });
  }
  if (candidate.connectionStatus !== "verified") {
    reasons.push({ code: "CONNECTION_NOT_VERIFIED" });
  }
  if (!candidate.policyAllowed) {
    reasons.push({ code: "POLICY_DENIED" });
  }
  if (request.exactRoute && (
    candidate.providerConnectionId !== request.exactRoute.providerConnectionId
    || candidate.model !== request.exactRoute.model
  )) {
    reasons.push({ code: "EXACT_ROUTE_MISMATCH" });
  }

  reasons.push(...capabilityReasons(candidate, request));
  reasons.push(...catalogReasons(candidate));
  const health = healthReasons(candidate, request);
  reasons.push(...health.reasons);
  reasons.push(...quotaReasons(candidate, request));

  return {
    candidate: candidateRef(candidate),
    eligible: reasons.length === 0,
    exclusionReasons: reasons,
    probeRequired: health.probeRequired,
    quotaPressure: quotaPressure(candidate),
    healthSnapshotId: candidate.health.snapshotId,
    quotaSnapshotId: candidate.quota.snapshotId,
    catalogSnapshotId: candidate.catalogSnapshotId,
  };
}

function healthRank(candidate: ProviderRouteCandidate, evaluation: ProviderRouteCandidateEvaluation): number {
  if (evaluation.probeRequired) return 2;
  return candidate.health.status === "healthy" ? 0 : 1;
}

function compareEligible(
  left: { candidate: ProviderRouteCandidate; evaluation: ProviderRouteCandidateEvaluation },
  right: { candidate: ProviderRouteCandidate; evaluation: ProviderRouteCandidateEvaluation },
): number {
  const byPriority = left.candidate.priority - right.candidate.priority;
  if (byPriority !== 0) return byPriority;

  const byHealth = healthRank(left.candidate, left.evaluation) - healthRank(right.candidate, right.evaluation);
  if (byHealth !== 0) return byHealth;

  const leftPressure = left.evaluation.quotaPressure ?? Number.POSITIVE_INFINITY;
  const rightPressure = right.evaluation.quotaPressure ?? Number.POSITIVE_INFINITY;
  if (leftPressure !== rightPressure) return leftPressure - rightPressure;

  return [left.candidate.provider, left.candidate.model, left.candidate.providerConnectionId]
    .join("\u0000")
    .localeCompare([right.candidate.provider, right.candidate.model, right.candidate.providerConnectionId].join("\u0000"));
}

export function selectProviderRoute(
  candidates: readonly ProviderRouteCandidate[],
  request: ProviderRouteRequest,
): ProviderRouteDecision {
  const evaluated = candidates.map((candidate) => ({
    candidate,
    evaluation: evaluateCandidate(candidate, request),
  }));

  const selectedEntry = evaluated
    .filter((entry) => entry.evaluation.eligible)
    .sort(compareEligible)[0] ?? null;

  const considered = evaluated
    .map((entry) => entry.evaluation)
    .sort((left, right) => [left.candidate.provider, left.candidate.model, left.candidate.providerConnectionId]
      .join("\u0000")
      .localeCompare([right.candidate.provider, right.candidate.model, right.candidate.providerConnectionId].join("\u0000")));

  return {
    algorithmVersion: ROUTE_DECISION_ALGORITHM_VERSION,
    candidateSnapshotId: request.candidateSnapshotId,
    decidedAtEpochMs: request.nowEpochMs,
    requiredCapabilities: [...request.requiredCapabilities],
    exactRoute: request.exactRoute ? { ...request.exactRoute } : null,
    selected: selectedEntry ? {
      ...candidateRef(selectedEntry.candidate),
      reason: "eligible_best_ranked",
      probeRequired: selectedEntry.evaluation.probeRequired,
    } : null,
    considered,
  };
}

export type ProviderFailureClass =
  | "auth_or_permission"
  | "rate_limited"
  | "model_unavailable"
  | "upstream_5xx"
  | "timeout"
  | "network_error"
  | "non_retryable_http";

export interface ProviderFailureDisposition {
  failureClass: ProviderFailureClass;
  retryable: boolean;
  healthMutation: "none" | "cooldown" | "unavailable";
  catalogMutation: "none" | "retirement_signal";
  cooldownMs: number | null;
  qualitySampleEligible: false;
}

const MIN_COOLDOWN_MS = 1_000;
const DEFAULT_TRANSIENT_COOLDOWN_MS = 5_000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 15 * 60_000;

function boundedCooldown(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, Math.trunc(value)));
}

export function classifyProviderFailure(input: {
  statusCode?: number | null;
  kind?: "http" | "timeout" | "network";
  retryAfterMs?: number | null;
}): ProviderFailureDisposition {
  if (input.kind === "timeout") {
    return {
      failureClass: "timeout",
      retryable: true,
      healthMutation: "cooldown",
      catalogMutation: "none",
      cooldownMs: boundedCooldown(input.retryAfterMs, DEFAULT_TRANSIENT_COOLDOWN_MS),
      qualitySampleEligible: false,
    };
  }
  if (input.kind === "network") {
    return {
      failureClass: "network_error",
      retryable: true,
      healthMutation: "cooldown",
      catalogMutation: "none",
      cooldownMs: boundedCooldown(input.retryAfterMs, DEFAULT_TRANSIENT_COOLDOWN_MS),
      qualitySampleEligible: false,
    };
  }

  const status = input.statusCode ?? 0;
  if (status === 401 || status === 403) {
    return {
      failureClass: "auth_or_permission",
      retryable: false,
      healthMutation: "unavailable",
      catalogMutation: "none",
      cooldownMs: null,
      qualitySampleEligible: false,
    };
  }
  if (status === 404 || status === 410) {
    return {
      failureClass: "model_unavailable",
      retryable: false,
      healthMutation: "none",
      catalogMutation: "retirement_signal",
      cooldownMs: null,
      qualitySampleEligible: false,
    };
  }
  if (status === 429) {
    return {
      failureClass: "rate_limited",
      retryable: true,
      healthMutation: "cooldown",
      catalogMutation: "none",
      cooldownMs: boundedCooldown(input.retryAfterMs, DEFAULT_RATE_LIMIT_COOLDOWN_MS),
      qualitySampleEligible: false,
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      failureClass: "upstream_5xx",
      retryable: true,
      healthMutation: "cooldown",
      catalogMutation: "none",
      cooldownMs: boundedCooldown(input.retryAfterMs, DEFAULT_TRANSIENT_COOLDOWN_MS),
      qualitySampleEligible: false,
    };
  }
  return {
    failureClass: "non_retryable_http",
    retryable: false,
    healthMutation: "none",
    catalogMutation: "none",
    cooldownMs: null,
    qualitySampleEligible: false,
  };
}
