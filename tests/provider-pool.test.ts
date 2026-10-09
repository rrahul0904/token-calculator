import { describe, expect, it } from "vitest";
import {
  classifyProviderFailure,
  selectProviderRoute,
  type ProviderRouteCandidate,
  type ProviderRouteRequest,
} from "@/lib/gateway/provider-pool";

const NOW = Date.parse("2026-10-09T21:00:00Z");

function candidate(overrides: Partial<ProviderRouteCandidate> = {}): ProviderRouteCandidate {
  return {
    organizationId: "org_a",
    providerConnectionId: "pc_openai",
    provider: "openai",
    model: "model-a",
    connectionStatus: "verified",
    policyAllowed: true,
    priority: 10,
    capabilities: {
      chat: "supported",
      streaming: "supported",
      tools: "supported",
      structured_output: "supported",
      vision: "unsupported",
    },
    health: {
      snapshotId: "health-1",
      status: "healthy",
      cooldownUntil: null,
    },
    quota: {
      snapshotId: "quota-1",
      enforcement: "required",
      limits: { rpm: 60, rpd: 10_000, tpm: 100_000, tpd: 5_000_000 },
      used: { rpm: 0, rpd: 0, tpm: 0, tpd: 0 },
    },
    catalogSnapshotId: "catalog-1",
    ...overrides,
  };
}

function request(overrides: Partial<ProviderRouteRequest> = {}): ProviderRouteRequest {
  return {
    organizationId: "org_a",
    requiredCapabilities: ["chat"],
    estimatedInputTokens: 1_000,
    maxOutputTokens: 500,
    nowEpochMs: NOW,
    candidateSnapshotId: "candidate-snapshot-1",
    ...overrides,
  };
}

function codes(decision: ReturnType<typeof selectProviderRoute>, providerConnectionId: string) {
  return decision.considered
    .find((item) => item.candidate.providerConnectionId === providerConnectionId)
    ?.exclusionReasons.map((reason) => reason.code) ?? [];
}

describe("provider pool routing", () => {
  it("selects deterministically by priority, health, quota pressure, then stable identity", () => {
    const lowPressure = candidate({
      providerConnectionId: "pc_b",
      provider: "anthropic",
      priority: 5,
      quota: {
        snapshotId: "quota-b",
        enforcement: "required",
        limits: { rpm: 100, rpd: 10_000, tpm: 100_000, tpd: 5_000_000 },
        used: { rpm: 10, rpd: 100, tpm: 10_000, tpd: 100_000 },
      },
    });
    const highPressure = candidate({
      providerConnectionId: "pc_a",
      provider: "openai",
      priority: 5,
      quota: {
        snapshotId: "quota-a",
        enforcement: "required",
        limits: { rpm: 100, rpd: 10_000, tpm: 100_000, tpd: 5_000_000 },
        used: { rpm: 80, rpd: 8_000, tpm: 80_000, tpd: 4_000_000 },
      },
    });

    const forward = selectProviderRoute([highPressure, lowPressure], request());
    const reverse = selectProviderRoute([lowPressure, highPressure], request());

    expect(forward.selected?.providerConnectionId).toBe("pc_b");
    expect(reverse.selected).toEqual(forward.selected);
    expect(reverse.considered).toEqual(forward.considered);
  });

  it("fails closed when a required capability is unsupported or unknown", () => {
    const unsupported = candidate({
      providerConnectionId: "pc_unsupported",
      capabilities: { chat: "supported", tools: "unsupported" },
    });
    const unknown = candidate({
      providerConnectionId: "pc_unknown",
      capabilities: { chat: "supported" },
    });

    const decision = selectProviderRoute([unsupported, unknown], request({ requiredCapabilities: ["chat", "tools"] }));

    expect(decision.selected).toBeNull();
    expect(codes(decision, "pc_unsupported")).toContain("CAPABILITY_UNSUPPORTED");
    expect(codes(decision, "pc_unknown")).toContain("CAPABILITY_UNKNOWN");
  });

  it("skips active cooldowns and requires an explicit probe after expiry", () => {
    const active = candidate({
      providerConnectionId: "pc_active_cooldown",
      health: {
        snapshotId: "health-active",
        status: "cooling_down",
        cooldownUntil: new Date(NOW + 60_000).toISOString(),
      },
    });
    const expired = candidate({
      providerConnectionId: "pc_expired_cooldown",
      health: {
        snapshotId: "health-expired",
        status: "cooling_down",
        cooldownUntil: new Date(NOW - 1).toISOString(),
      },
    });

    const blocked = selectProviderRoute([active, expired], request());
    expect(blocked.selected).toBeNull();
    expect(codes(blocked, "pc_active_cooldown")).toContain("HEALTH_COOLING_DOWN");
    expect(codes(blocked, "pc_expired_cooldown")).toContain("HEALTH_PROBE_REQUIRED");

    const probe = selectProviderRoute([expired], request({ allowCooldownProbe: true }));
    expect(probe.selected?.providerConnectionId).toBe("pc_expired_cooldown");
    expect(probe.selected?.probeRequired).toBe(true);
  });

  it("excludes exhausted provider quota before dispatch", () => {
    const exhausted = candidate({
      providerConnectionId: "pc_exhausted",
      quota: {
        snapshotId: "quota-exhausted",
        enforcement: "required",
        limits: { rpm: 60, rpd: 10_000, tpm: 1_200, tpd: 5_000_000 },
        used: { rpm: 0, rpd: 0, tpm: 200, tpd: 0 },
      },
    });

    const decision = selectProviderRoute([exhausted], request({ estimatedInputTokens: 1_000, maxOutputTokens: 500 }));

    expect(decision.selected).toBeNull();
    expect(codes(decision, "pc_exhausted")).toContain("QUOTA_EXHAUSTED");
  });

  it("treats unknown required quota state as unknown rather than unlimited or zero", () => {
    const unknown = candidate({
      providerConnectionId: "pc_quota_unknown",
      quota: {
        snapshotId: "quota-unknown",
        enforcement: "required",
        limits: { rpm: 60, rpd: null, tpm: 100_000, tpd: 5_000_000 },
        used: { rpm: 0, rpd: null, tpm: 0, tpd: 0 },
      },
    });

    const decision = selectProviderRoute([unknown], request());

    expect(decision.selected).toBeNull();
    expect(codes(decision, "pc_quota_unknown")).toContain("QUOTA_UNKNOWN");
  });

  it("keeps cross-tenant and policy-denied connections out of failover", () => {
    const crossTenant = candidate({ organizationId: "org_b", providerConnectionId: "pc_other_tenant" });
    const denied = candidate({ providerConnectionId: "pc_denied", policyAllowed: false });

    const decision = selectProviderRoute([crossTenant, denied], request());

    expect(decision.selected).toBeNull();
    expect(codes(decision, "pc_other_tenant")).toContain("TENANT_MISMATCH");
    expect(codes(decision, "pc_denied")).toContain("POLICY_DENIED");
  });

  it("preserves exact-route orchestration by excluding automatic substitutions", () => {
    const exact = candidate({ providerConnectionId: "pc_exact", model: "model-exact", priority: 100 });
    const preferredButWrong = candidate({ providerConnectionId: "pc_other", model: "model-fast", priority: 1 });

    const decision = selectProviderRoute([preferredButWrong, exact], request({
      exactRoute: { providerConnectionId: "pc_exact", model: "model-exact" },
    }));

    expect(decision.selected?.providerConnectionId).toBe("pc_exact");
    expect(codes(decision, "pc_other")).toContain("EXACT_ROUTE_MISMATCH");
  });

  it("records stable exclusion codes and metadata-only decision snapshots", () => {
    const denied = candidate({ providerConnectionId: "pc_denied", policyAllowed: false });
    const decision = selectProviderRoute([denied], request({ requiredCapabilities: ["chat", "vision"] }));
    const serialized = JSON.stringify(decision);

    expect(codes(decision, "pc_denied")).toEqual(["POLICY_DENIED", "CAPABILITY_UNSUPPORTED"]);
    expect(decision.algorithmVersion).toBe("provider-pool/v1");
    expect(decision.candidateSnapshotId).toBe("candidate-snapshot-1");
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("credential");
  });
});

describe("provider failure classification", () => {
  it("does not retry 401/403 as transient provider failures", () => {
    for (const statusCode of [401, 403]) {
      expect(classifyProviderFailure({ statusCode })).toEqual({
        failureClass: "auth_or_permission",
        retryable: false,
        healthMutation: "unavailable",
        cooldownMs: null,
      });
    }
  });

  it("turns 429 into bounded cooldown feedback", () => {
    expect(classifyProviderFailure({ statusCode: 429, retryAfterMs: 45_000 })).toEqual({
      failureClass: "rate_limited",
      retryable: true,
      healthMutation: "cooldown",
      cooldownMs: 45_000,
    });

    expect(classifyProviderFailure({ statusCode: 429, retryAfterMs: 60 * 60_000 }).cooldownMs).toBe(15 * 60_000);
  });
});
