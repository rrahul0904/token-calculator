import { describe, expect, it } from "vitest";

import { evaluateDonorTerminalTransition } from "@/lib/optimization/portfolio-lifecycle";

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    donorId: "donor-a",
    sourceConfidence: "verified" as const,
    behaviorContracts: "passed" as const,
    cleanRoomImplementation: "passed" as const,
    independentVerification: "passed" as const,
    hostedCertificationRequired: false,
    hostedCertification: "not_applicable" as const,
    benchmarkEvidence: "passed" as const,
    duplicateOf: null,
    exclusionReason: null,
    blockedReason: null,
    ...overrides,
  };
}

describe("portfolio donor lifecycle", () => {
  it("allows integrated capability only after every required gate passes", () => {
    const result = evaluateDonorTerminalTransition(evidence(), "integrated_capability");
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("blocks integration when source identity is only a family reference", () => {
    const result = evaluateDonorTerminalTransition(
      evidence({ sourceConfidence: "family_reference" }),
      "integrated_capability",
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("source_identity_not_verified");
  });

  it("requires hosted certification when the capability has a hosted/runtime gate", () => {
    const result = evaluateDonorTerminalTransition(
      evidence({ hostedCertificationRequired: true, hostedCertification: "not_run" }),
      "integrated_capability",
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("hosted_certification_not_passed");
  });

  it("allows benchmark-only family references only with passed benchmark evidence", () => {
    const allowed = evaluateDonorTerminalTransition(
      evidence({ sourceConfidence: "family_reference", cleanRoomImplementation: "not_run" }),
      "benchmark_only",
    );
    expect(allowed.allowed).toBe(true);

    const blocked = evaluateDonorTerminalTransition(
      evidence({ sourceConfidence: "family_reference", benchmarkEvidence: "not_run" }),
      "benchmark_only",
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockers).toContain("benchmark_evidence_not_passed");
  });

  it("requires an explicit consolidation target for duplicate donors", () => {
    const missing = evaluateDonorTerminalTransition(evidence(), "duplicate_consolidated");
    expect(missing.allowed).toBe(false);
    expect(missing.blockers).toContain("duplicate_target_required");

    const mapped = evaluateDonorTerminalTransition(
      evidence({ duplicateOf: "repository-context" }),
      "duplicate_consolidated",
    );
    expect(mapped.allowed).toBe(true);
  });

  it("requires explicit reasons for excluded and blocked outcomes", () => {
    expect(evaluateDonorTerminalTransition(evidence(), "excluded").allowed).toBe(false);
    expect(evaluateDonorTerminalTransition(evidence({ exclusionReason: "No unique capability beyond existing primitive." }), "excluded").allowed).toBe(true);
    expect(evaluateDonorTerminalTransition(evidence(), "blocked").allowed).toBe(false);
    expect(evaluateDonorTerminalTransition(evidence({ blockedReason: "Canonical donor identity unresolved." }), "blocked").allowed).toBe(true);
  });
});
