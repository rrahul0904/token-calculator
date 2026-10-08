import { describe, expect, it } from "vitest";
import {
  deriveQuotaWindowState,
  evaluateQuotaAlert,
  resolveQuotaSnapshot,
  type QuotaWindowDerivedState,
} from "@/lib/quota/derived";
import type { ProviderQuotaAuthState, ProviderQuotaSnapshot } from "@/lib/quota/types";

function snapshot(options: {
  fetchedAt: string;
  remainingPercent?: number | null;
  resetAt?: string | null;
  authState?: ProviderQuotaAuthState;
}): ProviderQuotaSnapshot {
  const remainingPercent = options.remainingPercent ?? null;
  return {
    provider: "codex",
    authState: options.authState ?? "active",
    source: "provider_reported",
    fetchedAt: options.fetchedAt,
    accountRef: null,
    plan: "plus",
    windows: remainingPercent === null
      ? []
      : [{
        label: "5h",
        remainingPercent,
        resetAt: options.resetAt ?? "2026-10-08T03:00:00.000Z",
      }],
    note: null,
  };
}

function alertState(overrides: Partial<QuotaWindowDerivedState> = {}): QuotaWindowDerivedState {
  return {
    provider: "codex",
    label: "5h",
    observedAt: "2026-10-07T20:00:00.000Z",
    remainingPercent: 8,
    resetAt: "2026-10-07T23:00:00.000Z",
    freshness: "fresh",
    burnRatePercentPerHour: 10,
    exhaustAt: "2026-10-07T20:48:00.000Z",
    exhaustBeforeReset: true,
    forecastConfidence: "medium",
    ...overrides,
  };
}

describe("provider quota derived state", () => {
  it("derives a reset-aware burn rate and exhaustion forecast from fresh history", () => {
    const current = snapshot({
      fetchedAt: "2026-10-07T20:00:00.000Z",
      remainingPercent: 60,
    });
    const state = deriveQuotaWindowState({
      current,
      label: "5h",
      history: [snapshot({ fetchedAt: "2026-10-07T18:00:00.000Z", remainingPercent: 80 })],
      now: new Date("2026-10-07T20:00:30.000Z"),
    });

    expect(state.freshness).toBe("fresh");
    expect(state.burnRatePercentPerHour).toBe(10);
    expect(state.exhaustAt).toBe("2026-10-08T02:00:00.000Z");
    expect(state.exhaustBeforeReset).toBe(true);
    expect(state.forecastConfidence).toBe("high");
  });

  it("does not treat a quota increase or reset-window change as ongoing burn", () => {
    const current = snapshot({
      fetchedAt: "2026-10-07T20:00:00.000Z",
      remainingPercent: 60,
      resetAt: "2026-10-08T03:00:00.000Z",
    });
    const increased = deriveQuotaWindowState({
      current,
      label: "5h",
      history: [snapshot({ fetchedAt: "2026-10-07T19:00:00.000Z", remainingPercent: 40 })],
      now: new Date("2026-10-07T20:00:10.000Z"),
    });
    const resetChanged = deriveQuotaWindowState({
      current,
      label: "5h",
      history: [snapshot({
        fetchedAt: "2026-10-07T19:00:00.000Z",
        remainingPercent: 80,
        resetAt: "2026-10-07T22:00:00.000Z",
      })],
      now: new Date("2026-10-07T20:00:10.000Z"),
    });

    expect(increased.burnRatePercentPerHour).toBeNull();
    expect(increased.exhaustAt).toBeNull();
    expect(resetChanged.burnRatePercentPerHour).toBeNull();
    expect(resetChanged.forecastConfidence).toBe("unavailable");
  });

  it("suppresses forecasts from stale snapshots", () => {
    const current = snapshot({ fetchedAt: "2026-10-07T19:00:00.000Z", remainingPercent: 60 });
    const state = deriveQuotaWindowState({
      current,
      label: "5h",
      history: [snapshot({ fetchedAt: "2026-10-07T18:00:00.000Z", remainingPercent: 80 })],
      now: new Date("2026-10-07T20:00:00.000Z"),
      staleAfterMs: 120_000,
    });

    expect(state.freshness).toBe("stale");
    expect(state.burnRatePercentPerHour).toBeNull();
    expect(state.exhaustAt).toBeNull();
  });

  it("retains a last-known-good numeric snapshot when the newest provider fetch fails", () => {
    const lastKnownGood = snapshot({
      fetchedAt: "2026-10-07T19:59:00.000Z",
      remainingPercent: 55,
    });
    const current = snapshot({
      fetchedAt: "2026-10-07T20:00:00.000Z",
      authState: "unavailable",
    });
    const resolved = resolveQuotaSnapshot({
      current,
      lastKnownGood,
      now: new Date("2026-10-07T20:00:00.000Z"),
    });

    expect(resolved.snapshot).toBe(lastKnownGood);
    expect(resolved.freshness).toBe("fresh");
    expect(resolved.degraded).toBe(true);
    expect(resolved.usedLastKnownGood).toBe(true);
    expect(resolved.reason).toContain("unavailable");
  });
});

describe("provider quota alerts", () => {
  it("fires once for a critical condition and rearms only after recovery", () => {
    const first = evaluateQuotaAlert(alertState());
    const duplicate = evaluateQuotaAlert(alertState(), first.nextMemory);
    const recovered = evaluateQuotaAlert(
      alertState({ remainingPercent: 20, exhaustAt: null, exhaustBeforeReset: null }),
      duplicate.nextMemory,
    );
    const repeatedAfterRecovery = evaluateQuotaAlert(alertState(), recovered.nextMemory);

    expect(first.notify).toBe(true);
    expect(first.reason).toBe("low_remaining");
    expect(duplicate.notify).toBe(false);
    expect(recovered.notify).toBe(false);
    expect(recovered.nextMemory.armed).toBe(true);
    expect(repeatedAfterRecovery.notify).toBe(true);
  });

  it("supports forecast alerts without requiring a low remaining threshold", () => {
    const decision = evaluateQuotaAlert(
      alertState({ remainingPercent: 20 }),
      null,
      { lowRemainingPercent: 10, forecastWithinMinutes: 60 },
    );

    expect(decision.notify).toBe(true);
    expect(decision.reason).toBe("forecast_exhaustion");
  });

  it("rearms a persistent condition when the provider reset window changes", () => {
    const first = evaluateQuotaAlert(alertState());
    const afterReset = evaluateQuotaAlert(
      alertState({ resetAt: "2026-10-08T04:00:00.000Z" }),
      first.nextMemory,
    );

    expect(first.notify).toBe(true);
    expect(afterReset.notify).toBe(true);
    expect(afterReset.nextMemory.resetAt).toBe("2026-10-08T04:00:00.000Z");
  });

  it("does not notify from stale derived state", () => {
    const decision = evaluateQuotaAlert(alertState({ freshness: "stale" }));
    expect(decision.notify).toBe(false);
  });
});
