import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { observeQuotaSnapshot, readQuotaStateStore } from "@/lib/quota/local-state";
import type { ProviderQuotaAuthState, ProviderQuotaSnapshot } from "@/lib/quota/types";

function snapshot(options: {
  fetchedAt: string;
  remainingPercent?: number | null;
  resetAt?: string;
  authState?: ProviderQuotaAuthState;
}): ProviderQuotaSnapshot {
  const remainingPercent = options.remainingPercent ?? null;
  return {
    provider: "codex",
    authState: options.authState ?? "active",
    source: "provider_reported",
    fetchedAt: options.fetchedAt,
    accountRef: "acct_123456789abc",
    plan: "plus",
    windows: remainingPercent === null ? [] : [{
      label: "5h",
      remainingPercent,
      resetAt: options.resetAt ?? "2026-10-08T06:00:00.000Z",
    }],
    note: options.authState && options.authState !== "active" ? "synthetic provider failure" : null,
  };
}

async function stateFile() {
  const dir = await mkdtemp(join(tmpdir(), "ti-quota-state-"));
  return join(dir, "quota-state.json");
}

describe("local quota monitor state", () => {
  it("persists normalized snapshots and derives burn after restart", async () => {
    const path = await stateFile();
    await observeQuotaSnapshot(
      snapshot({ fetchedAt: "2026-10-07T20:00:00.000Z", remainingPercent: 80 }),
      { statePath: path, now: new Date("2026-10-07T20:00:30.000Z") },
    );

    const second = await observeQuotaSnapshot(
      snapshot({ fetchedAt: "2026-10-07T22:00:00.000Z", remainingPercent: 60 }),
      { statePath: path, now: new Date("2026-10-07T22:00:30.000Z") },
    );

    expect(second.historySamples).toBe(1);
    expect(second.windows).toHaveLength(1);
    expect(second.windows[0].state.burnRatePercentPerHour).toBe(10);
    expect(second.windows[0].state.forecastConfidence).toBe("high");
    const persisted = await readQuotaStateStore(path);
    expect(persisted.providers.codex?.snapshots).toHaveLength(2);
    expect(await readFile(path, "utf8")).not.toContain("Bearer ");
  });

  it("retains last-known-good metadata after provider failure but suppresses alerts", async () => {
    const path = await stateFile();
    await observeQuotaSnapshot(
      snapshot({ fetchedAt: "2026-10-07T20:00:00.000Z", remainingPercent: 8 }),
      { statePath: path, now: new Date("2026-10-07T20:00:30.000Z") },
    );

    const failed = await observeQuotaSnapshot(
      snapshot({ fetchedAt: "2026-10-07T20:01:00.000Z", authState: "unavailable" }),
      { statePath: path, now: new Date("2026-10-07T20:01:00.000Z") },
    );

    expect(failed.resolved.degraded).toBe(true);
    expect(failed.resolved.usedLastKnownGood).toBe(true);
    expect(failed.windows[0].state.remainingPercent).toBe(8);
    expect(failed.windows[0].alert.notify).toBe(false);
  });

  it("deduplicates a persistent low-quota alert across process restarts", async () => {
    const path = await stateFile();
    const first = await observeQuotaSnapshot(
      snapshot({ fetchedAt: "2026-10-07T20:00:00.000Z", remainingPercent: 8 }),
      { statePath: path, now: new Date("2026-10-07T20:00:30.000Z") },
    );
    const second = await observeQuotaSnapshot(
      snapshot({ fetchedAt: "2026-10-07T20:01:00.000Z", remainingPercent: 7 }),
      { statePath: path, now: new Date("2026-10-07T20:01:30.000Z") },
    );

    expect(first.windows[0].alert.notify).toBe(true);
    expect(second.windows[0].alert.notify).toBe(false);
  });

  it("rearms persisted alert memory when the provider reset window changes", async () => {
    const path = await stateFile();
    const first = await observeQuotaSnapshot(
      snapshot({ fetchedAt: "2026-10-07T20:00:00.000Z", remainingPercent: 8, resetAt: "2026-10-07T23:00:00.000Z" }),
      { statePath: path, now: new Date("2026-10-07T20:00:30.000Z") },
    );
    const afterReset = await observeQuotaSnapshot(
      snapshot({ fetchedAt: "2026-10-07T20:01:00.000Z", remainingPercent: 8, resetAt: "2026-10-08T04:00:00.000Z" }),
      { statePath: path, now: new Date("2026-10-07T20:01:30.000Z") },
    );

    expect(first.windows[0].alert.notify).toBe(true);
    expect(afterReset.windows[0].alert.notify).toBe(true);
  });

  it("fails closed to an empty store when local state is corrupted", async () => {
    const path = await stateFile();
    await writeFile(path, "{not-json provider-secret-text", "utf8");
    const store = await readQuotaStateStore(path);
    expect(store.version).toBe(1);
    expect(store.providers).toEqual({});
  });
});
