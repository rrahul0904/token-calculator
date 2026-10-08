import { hasNumericQuota, type ProviderQuotaSnapshot, type ProviderQuotaWindow } from "@/lib/quota/types";

export type QuotaFreshness = "fresh" | "stale";
export type QuotaForecastConfidence = "unavailable" | "low" | "medium" | "high";

export interface QuotaWindowDerivedState {
  provider: ProviderQuotaSnapshot["provider"];
  label: string;
  observedAt: string;
  remainingPercent: number | null;
  resetAt: string | null;
  freshness: QuotaFreshness;
  burnRatePercentPerHour: number | null;
  exhaustAt: string | null;
  exhaustBeforeReset: boolean | null;
  forecastConfidence: QuotaForecastConfidence;
}

export interface ResolvedQuotaSnapshot {
  snapshot: ProviderQuotaSnapshot | null;
  freshness: QuotaFreshness | null;
  degraded: boolean;
  usedLastKnownGood: boolean;
  reason: string | null;
}

export interface QuotaAlertMemory {
  armed: boolean;
  resetAt: string | null;
  fingerprint: string | null;
}

export interface QuotaAlertDecision {
  notify: boolean;
  reason: "low_remaining" | "forecast_exhaustion" | null;
  fingerprint: string | null;
  nextMemory: QuotaAlertMemory;
}

export interface QuotaAlertConfig {
  lowRemainingPercent?: number;
  recoveryHysteresisPercent?: number;
  forecastWithinMinutes?: number;
}

const DEFAULT_STALE_AFTER_MS = 120_000;
const DEFAULT_FORECAST_LOOKBACK_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_MIN_SAMPLE_SPAN_MS = 60_000;

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function freshnessAt(
  fetchedAt: string,
  now: Date,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): QuotaFreshness {
  const fetched = timestamp(fetchedAt);
  if (fetched === null) return "stale";
  return now.getTime() - fetched <= staleAfterMs ? "fresh" : "stale";
}

function windowFromSnapshot(snapshot: ProviderQuotaSnapshot, label: string): ProviderQuotaWindow | null {
  return snapshot.windows.find((window) => window.label === label) ?? null;
}

function sameResetWindow(current: ProviderQuotaWindow, previous: ProviderQuotaWindow): boolean {
  if (current.resetAt === null || previous.resetAt === null) return current.resetAt === previous.resetAt;
  return current.resetAt === previous.resetAt;
}

function forecastConfidence(sampleSpanMs: number): QuotaForecastConfidence {
  if (sampleSpanMs >= 2 * 60 * 60 * 1_000) return "high";
  if (sampleSpanMs >= 30 * 60 * 1_000) return "medium";
  return "low";
}

/**
 * Derive freshness and a reset-aware exhaustion forecast from provider-reported
 * quota snapshots. A forecast is deliberately omitted when the latest sample is
 * stale, the counter increases, the reset boundary changes, or history is too
 * short. Those cases are not evidence of ongoing burn.
 */
export function deriveQuotaWindowState(options: {
  current: ProviderQuotaSnapshot;
  label: string;
  history?: ProviderQuotaSnapshot[];
  now?: Date;
  staleAfterMs?: number;
  lookbackMs?: number;
  minSampleSpanMs?: number;
}): QuotaWindowDerivedState {
  const now = options.now ?? new Date();
  const currentWindow = windowFromSnapshot(options.current, options.label);
  const freshness = freshnessAt(options.current.fetchedAt, now, options.staleAfterMs);
  const base: QuotaWindowDerivedState = {
    provider: options.current.provider,
    label: options.label,
    observedAt: options.current.fetchedAt,
    remainingPercent: currentWindow?.remainingPercent ?? null,
    resetAt: currentWindow?.resetAt ?? null,
    freshness,
    burnRatePercentPerHour: null,
    exhaustAt: null,
    exhaustBeforeReset: null,
    forecastConfidence: "unavailable",
  };

  if (!currentWindow || currentWindow.remainingPercent === null || freshness !== "fresh") return base;
  const currentRemainingPercent = currentWindow.remainingPercent;

  const currentAt = timestamp(options.current.fetchedAt);
  if (currentAt === null) return base;

  const lookbackMs = options.lookbackMs ?? DEFAULT_FORECAST_LOOKBACK_MS;
  const minSampleSpanMs = options.minSampleSpanMs ?? DEFAULT_MIN_SAMPLE_SPAN_MS;
  const candidates = (options.history ?? [])
    .filter((snapshot) => snapshot.provider === options.current.provider)
    .map((snapshot) => ({ snapshot, at: timestamp(snapshot.fetchedAt), window: windowFromSnapshot(snapshot, options.label) }))
    .filter((entry): entry is { snapshot: ProviderQuotaSnapshot; at: number; window: ProviderQuotaWindow } => (
      entry.at !== null
      && entry.at < currentAt
      && currentAt - entry.at <= lookbackMs
      && entry.window !== null
      && entry.window.remainingPercent !== null
    ))
    .sort((a, b) => b.at - a.at);

  const nearest = candidates[0];
  if (!nearest || !sameResetWindow(currentWindow, nearest.window)) return base;
  if ((nearest.window.remainingPercent ?? 0) <= currentRemainingPercent) return base;

  const earliest = [...candidates]
    .reverse()
    .find((entry) => sameResetWindow(currentWindow, entry.window)
      && (entry.window.remainingPercent ?? 0) > currentRemainingPercent);
  if (!earliest) return base;

  const sampleSpanMs = currentAt - earliest.at;
  if (sampleSpanMs < minSampleSpanMs) return base;

  const consumedPercent = (earliest.window.remainingPercent ?? currentRemainingPercent)
    - currentRemainingPercent;
  const hours = sampleSpanMs / (60 * 60 * 1_000);
  const rate = consumedPercent / hours;
  if (!Number.isFinite(rate) || rate <= 0) return base;

  const exhaustAtMs = currentAt + (currentRemainingPercent / rate) * 60 * 60 * 1_000;
  const resetAtMs = timestamp(currentWindow.resetAt);
  return {
    ...base,
    burnRatePercentPerHour: Math.round(rate * 100) / 100,
    exhaustAt: new Date(exhaustAtMs).toISOString(),
    exhaustBeforeReset: resetAtMs === null ? null : exhaustAtMs < resetAtMs,
    forecastConfidence: forecastConfidence(sampleSpanMs),
  };
}

/**
 * Preserve the last known numeric quota when the newest provider fetch fails.
 * The fallback is explicitly marked degraded and retains its own age/freshness.
 */
export function resolveQuotaSnapshot(options: {
  current: ProviderQuotaSnapshot | null;
  lastKnownGood?: ProviderQuotaSnapshot | null;
  now?: Date;
  staleAfterMs?: number;
}): ResolvedQuotaSnapshot {
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  if (options.current && hasNumericQuota(options.current)) {
    return {
      snapshot: options.current,
      freshness: freshnessAt(options.current.fetchedAt, now, staleAfterMs),
      degraded: false,
      usedLastKnownGood: false,
      reason: null,
    };
  }

  if (options.lastKnownGood && hasNumericQuota(options.lastKnownGood)) {
    return {
      snapshot: options.lastKnownGood,
      freshness: freshnessAt(options.lastKnownGood.fetchedAt, now, staleAfterMs),
      degraded: true,
      usedLastKnownGood: true,
      reason: options.current
        ? `latest provider state is ${options.current.authState}`
        : "latest provider snapshot is unavailable",
    };
  }

  if (options.current) {
    return {
      snapshot: options.current,
      freshness: freshnessAt(options.current.fetchedAt, now, staleAfterMs),
      degraded: options.current.authState !== "active",
      usedLastKnownGood: false,
      reason: options.current.authState === "active" ? null : `latest provider state is ${options.current.authState}`,
    };
  }

  return {
    snapshot: null,
    freshness: null,
    degraded: true,
    usedLastKnownGood: false,
    reason: "no provider snapshot is available",
  };
}

/**
 * Stateful, deterministic alert decision. A critical condition fires once,
 * stays disarmed while the condition persists, and rearms only after recovery
 * (with hysteresis) or a provider reset-window change.
 */
export function evaluateQuotaAlert(
  state: QuotaWindowDerivedState,
  memory: QuotaAlertMemory | null = null,
  config: QuotaAlertConfig = {},
): QuotaAlertDecision {
  const lowRemainingPercent = config.lowRemainingPercent ?? 10;
  const recoveryHysteresisPercent = config.recoveryHysteresisPercent ?? 5;
  const forecastWithinMinutes = config.forecastWithinMinutes ?? 60;
  const resetChanged = memory !== null && memory.resetAt !== state.resetAt;
  let working: QuotaAlertMemory = resetChanged
    ? { armed: true, resetAt: state.resetAt, fingerprint: null }
    : (memory ?? { armed: true, resetAt: state.resetAt, fingerprint: null });

  if (state.freshness !== "fresh" || state.remainingPercent === null) {
    return { notify: false, reason: null, fingerprint: null, nextMemory: working };
  }

  const exhaustAtMs = timestamp(state.exhaustAt);
  const observedAtMs = timestamp(state.observedAt);
  const minutesToExhaust = exhaustAtMs !== null && observedAtMs !== null
    ? (exhaustAtMs - observedAtMs) / 60_000
    : null;
  const lowRemaining = state.remainingPercent <= lowRemainingPercent;
  const forecastCritical = state.exhaustBeforeReset === true
    && minutesToExhaust !== null
    && minutesToExhaust >= 0
    && minutesToExhaust <= forecastWithinMinutes;
  const recovered = state.remainingPercent >= lowRemainingPercent + recoveryHysteresisPercent
    && !forecastCritical;

  if (recovered && !working.armed) {
    working = { armed: true, resetAt: state.resetAt, fingerprint: null };
  }

  const reason = lowRemaining
    ? "low_remaining"
    : (forecastCritical ? "forecast_exhaustion" : null);
  if (!reason || !working.armed) {
    return { notify: false, reason, fingerprint: working.fingerprint, nextMemory: working };
  }

  const fingerprint = [state.provider, state.label, state.resetAt ?? "no-reset", reason].join(":");
  return {
    notify: true,
    reason,
    fingerprint,
    nextMemory: { armed: false, resetAt: state.resetAt, fingerprint },
  };
}
