import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  deriveQuotaWindowState,
  evaluateQuotaAlert,
  resolveQuotaSnapshot,
  type QuotaAlertConfig,
  type QuotaAlertDecision,
  type QuotaAlertMemory,
  type QuotaWindowDerivedState,
  type ResolvedQuotaSnapshot,
} from "@/lib/quota/derived";
import { hasNumericQuota, type ProviderQuotaName, type ProviderQuotaSnapshot } from "@/lib/quota/types";

export const DEFAULT_QUOTA_STATE_PATH = resolve(homedir(), ".config", "token-intelligence", "quota-state.json");

interface StoredProviderQuotaState {
  snapshots: ProviderQuotaSnapshot[];
  alerts: Record<string, QuotaAlertMemory>;
}

interface QuotaStateStore {
  version: 1;
  providers: Partial<Record<ProviderQuotaName, StoredProviderQuotaState>>;
}

export interface QuotaMonitorWindowResult {
  state: QuotaWindowDerivedState;
  alert: QuotaAlertDecision;
}

export interface QuotaMonitorResult {
  version: 1;
  provider: ProviderQuotaName;
  observedAt: string;
  current: ProviderQuotaSnapshot;
  resolved: ResolvedQuotaSnapshot;
  windows: QuotaMonitorWindowResult[];
  historySamples: number;
  persistedLocally: true;
}

export interface ObserveQuotaOptions {
  statePath?: string;
  now?: Date;
  staleAfterMs?: number;
  maxSnapshots?: number;
  alertConfig?: QuotaAlertConfig;
}

const emptyStore = (): QuotaStateStore => ({ version: 1, providers: {} });

function providerState(store: QuotaStateStore, provider: ProviderQuotaName): StoredProviderQuotaState {
  return store.providers[provider] ?? { snapshots: [], alerts: {} };
}

function isQuotaSnapshot(value: unknown): value is ProviderQuotaSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ProviderQuotaSnapshot>;
  return typeof candidate.provider === "string"
    && typeof candidate.authState === "string"
    && candidate.source === "provider_reported"
    && typeof candidate.fetchedAt === "string"
    && Array.isArray(candidate.windows);
}

export async function readQuotaStateStore(path = DEFAULT_QUOTA_STATE_PATH): Promise<QuotaStateStore> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<QuotaStateStore>;
    if (parsed.version !== 1 || !parsed.providers || typeof parsed.providers !== "object") return emptyStore();

    const store = emptyStore();
    for (const [provider, raw] of Object.entries(parsed.providers)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const state = raw as Partial<StoredProviderQuotaState>;
      const snapshots = Array.isArray(state.snapshots) ? state.snapshots.filter(isQuotaSnapshot) : [];
      const alerts = state.alerts && typeof state.alerts === "object" && !Array.isArray(state.alerts)
        ? state.alerts as Record<string, QuotaAlertMemory>
        : {};
      store.providers[provider as ProviderQuotaName] = { snapshots, alerts };
    }
    return store;
  } catch {
    return emptyStore();
  }
}

async function writeQuotaStateStore(store: QuotaStateStore, path: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
  try { await chmod(path, 0o600); } catch { /* POSIX permissions may be unavailable. */ }
}

function suppressedAlert(memory: QuotaAlertMemory | null, resetAt: string | null): QuotaAlertDecision {
  const nextMemory = memory ?? { armed: true, resetAt, fingerprint: null };
  return { notify: false, reason: null, fingerprint: nextMemory.fingerprint, nextMemory };
}

/**
 * Convert one provider fetch into a restart-safe local monitor observation.
 * Only normalized quota metadata is persisted. OAuth bearer/refresh tokens never
 * enter this module or the state file.
 */
export async function observeQuotaSnapshot(
  snapshot: ProviderQuotaSnapshot,
  options: ObserveQuotaOptions = {},
): Promise<QuotaMonitorResult> {
  const statePath = options.statePath ?? DEFAULT_QUOTA_STATE_PATH;
  const now = options.now ?? new Date();
  const store = await readQuotaStateStore(statePath);
  const existing = providerState(store, snapshot.provider);
  const numericHistory = existing.snapshots.filter(hasNumericQuota);
  const lastKnownGood = [...numericHistory].reverse().find((item) => item.fetchedAt !== snapshot.fetchedAt) ?? null;
  const resolved = resolveQuotaSnapshot({
    current: snapshot,
    lastKnownGood,
    now,
    staleAfterMs: options.staleAfterMs,
  });

  const effective = resolved.snapshot;
  const windows: QuotaMonitorWindowResult[] = [];
  const nextAlerts = { ...existing.alerts };

  if (effective) {
    for (const window of effective.windows) {
      const state = deriveQuotaWindowState({
        current: effective,
        label: window.label,
        history: numericHistory,
        now,
        staleAfterMs: options.staleAfterMs,
      });
      const memory = nextAlerts[window.label] ?? null;
      const alert = resolved.degraded
        ? suppressedAlert(memory, state.resetAt)
        : evaluateQuotaAlert(state, memory, options.alertConfig);
      nextAlerts[window.label] = alert.nextMemory;
      windows.push({ state, alert });
    }
  }

  const maxSnapshots = Math.max(2, Math.trunc(options.maxSnapshots ?? 240));
  const snapshots = [...existing.snapshots, snapshot].slice(-maxSnapshots);
  store.providers[snapshot.provider] = { snapshots, alerts: nextAlerts };
  await writeQuotaStateStore(store, statePath);

  return {
    version: 1,
    provider: snapshot.provider,
    observedAt: snapshot.fetchedAt,
    current: snapshot,
    resolved,
    windows,
    historySamples: numericHistory.length,
    persistedLocally: true,
  };
}

export function formatQuotaMonitorResult(result: QuotaMonitorResult): string {
  const lines = [
    `${result.provider} quota monitor`,
    `status: ${result.current.authState}${result.resolved.degraded ? " (degraded)" : ""}`,
    `history samples: ${result.historySamples}`,
  ];

  if (result.resolved.reason) lines.push(`state: ${result.resolved.reason}`);
  for (const { state, alert } of result.windows) {
    const remaining = state.remainingPercent === null ? "unknown" : `${state.remainingPercent}% left`;
    const reset = state.resetAt ? ` · resets ${state.resetAt}` : "";
    lines.push(`${state.label}: ${remaining}${reset} · ${state.freshness}`);
    if (state.burnRatePercentPerHour !== null) lines.push(`  burn: ${state.burnRatePercentPerHour}%/h (${state.forecastConfidence} confidence)`);
    if (state.exhaustAt) lines.push(`  projected exhaustion: ${state.exhaustAt}${state.exhaustBeforeReset === true ? " before reset" : state.exhaustBeforeReset === false ? " after reset" : ""}`);
    if (alert.notify) lines.push(`  ALERT: ${alert.reason === "low_remaining" ? "low remaining quota" : "projected exhaustion before reset"}`);
  }
  lines.push("privacy: local quota metadata only; provider credentials are never persisted by Token Intelligence");
  return `${lines.join("\n")}\n`;
}
