import { describe, expect, it } from "vitest";
import { hostedQuotaBatchSchema, hostedQuotaReceiptId, hostedQuotaSnapshotSchema, toHostedQuotaSnapshot } from "@/lib/quota/hosted";
import type { ProviderQuotaSnapshot } from "@/lib/quota/types";

function localSnapshot(): ProviderQuotaSnapshot {
  return {
    provider: "codex",
    authState: "active",
    source: "provider_reported",
    fetchedAt: "2026-10-08T03:00:00.000Z",
    accountRef: "acct_abcdef123456",
    plan: "plus",
    windows: [
      { label: "5h", remainingPercent: 75, resetAt: "2026-10-08T08:00:00.000Z" },
    ],
    note: "local-only diagnostic text",
  };
}

describe("hosted quota receipt boundary", () => {
  it("allow-lists safe fields instead of spreading local snapshots", () => {
    const local = localSnapshot() as ProviderQuotaSnapshot & {
      accessToken: string;
      refreshToken: string;
      rawProviderResponse: unknown;
    };
    local.accessToken = "fixture-access-value";
    local.refreshToken = "fixture-refresh-value";
    local.rawProviderResponse = { secret: "fixture-raw-value" };

    const hosted = toHostedQuotaSnapshot(local);
    const serialized = JSON.stringify(hosted);

    expect(serialized).not.toContain("fixture-access-value");
    expect(serialized).not.toContain("fixture-refresh-value");
    expect(serialized).not.toContain("fixture-raw-value");
    expect(serialized).not.toContain("local-only diagnostic text");
    expect(Object.keys(hosted).sort()).toEqual([
      "accountRef",
      "authState",
      "fetchedAt",
      "plan",
      "provider",
      "source",
      "windows",
    ]);
  });

  it("derives a stable tenant-scoped receipt id for retry idempotency", () => {
    const hosted = toHostedQuotaSnapshot(localSnapshot());
    const first = hostedQuotaReceiptId({ organizationId: "org_a", projectId: "project_a", snapshot: hosted });
    const retry = hostedQuotaReceiptId({ organizationId: "org_a", projectId: "project_a", snapshot: hosted });
    const otherTenant = hostedQuotaReceiptId({ organizationId: "org_b", projectId: "project_a", snapshot: hosted });
    const changedSnapshot = hostedQuotaReceiptId({
      organizationId: "org_a",
      projectId: "project_a",
      snapshot: { ...hosted, fetchedAt: "2026-10-08T03:01:00.000Z" },
    });

    expect(first).toBe(retry);
    expect(first).toMatch(/^quota_[a-f0-9]{32}$/);
    expect(otherTenant).not.toBe(first);
    expect(changedSnapshot).not.toBe(first);
  });

  it("rejects unknown top-level fields such as token-like material", () => {
    const parsed = hostedQuotaSnapshotSchema.safeParse({
      ...toHostedQuotaSnapshot(localSnapshot()),
      accessToken: "fixture-access-value",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown nested fields inside quota windows", () => {
    const safe = toHostedQuotaSnapshot(localSnapshot());
    const parsed = hostedQuotaBatchSchema.safeParse({
      snapshots: [{
        ...safe,
        windows: [{ ...safe.windows[0], raw: "fixture-private-value" }],
      }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects raw provider account identifiers", () => {
    const parsed = hostedQuotaSnapshotSchema.safeParse({
      ...toHostedQuotaSnapshot(localSnapshot()),
      accountRef: "raw-provider-account-id",
    });
    expect(parsed.success).toBe(false);
  });
});
