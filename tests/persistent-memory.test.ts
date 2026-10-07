import { describe, expect, it } from "vitest";

import { evaluatePersistentMemory } from "@/lib/optimization/persistent-memory";

describe("persistent memory evidence", () => {
  it("blocks unverified isolation", () => {
    const result = evaluatePersistentMemory({
      id: "memory-isolation",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      provenanceGate: "verified",
      isolationGate: "not_run",
      sampleSize: 10,
      baselineSessionTokens: 30_000,
      candidateSessionTokens: 15_000,
    });

    expect(result.status).toBe("isolation_unverified");
    expect(result.claimable).toBe(false);
  });

  it("blocks stale or contradictory memories", () => {
    const stale = evaluatePersistentMemory({
      id: "stale-memory",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      provenanceGate: "verified",
      isolationGate: "verified",
      sampleSize: 10,
      baselineSessionTokens: 30_000,
      candidateSessionTokens: 15_000,
      staleMemoryCount: 1,
    });
    expect(stale.status).toBe("stale_memory");

    const contradictory = evaluatePersistentMemory({
      id: "contradictory-memory",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      provenanceGate: "verified",
      isolationGate: "verified",
      sampleSize: 10,
      baselineSessionTokens: 30_000,
      candidateSessionTokens: 15_000,
      contradictoryMemoryCount: 1,
    });
    expect(contradictory.status).toBe("contradiction_regression");
  });

  it("requires task-critical evidence to be retrieved", () => {
    const result = evaluatePersistentMemory({
      id: "memory-miss",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      provenanceGate: "verified",
      isolationGate: "verified",
      sampleSize: 10,
      baselineSessionTokens: 30_000,
      candidateSessionTokens: 15_000,
      requiredEvidenceRefs: ["architecture", "auth-decision"],
      retrievedEvidenceRefs: ["architecture"],
    });

    expect(result.status).toBe("evidence_loss");
    expect(result.missingEvidenceRefs).toEqual(["auth-decision"]);
  });

  it("charges memory write, index, retrieval and recovery overhead", () => {
    const result = evaluatePersistentMemory({
      id: "memory-overhead",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      provenanceGate: "verified",
      isolationGate: "verified",
      sampleSize: 10,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 10_000,
      memoryWriteTokens: 3_000,
      memoryIndexTokens: 2_000,
      memoryRetrievalTokens: 2_000,
      recoveryTokens: 4_000,
    });

    expect(result.netCandidateTokens).toBe(21_000);
    expect(result.status).toBe("token_regression");
  });

  it("verifies savings only with fresh, isolated, provenanced multi-session evidence", () => {
    const result = evaluatePersistentMemory({
      id: "verified-memory",
      memoryVersion: "clean-room-v1",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      freshness: "fresh",
      provenanceGate: "verified",
      isolationGate: "verified",
      sampleSize: 12,
      baselineSessionTokens: 50_000,
      candidateSessionTokens: 25_000,
      memoryWriteTokens: 2_000,
      memoryIndexTokens: 1_000,
      memoryRetrievalTokens: 2_000,
      recoveryTokens: 0,
      requiredEvidenceRefs: ["architecture", "convention"],
      retrievedEvidenceRefs: ["convention", "architecture"],
      contradictoryMemoryCount: 0,
      staleMemoryCount: 0,
      evidenceSource: "paired-multi-session-receipts",
    });

    expect(result.netCandidateTokens).toBe(30_000);
    expect(result.measuredSavingsTokens).toBe(20_000);
    expect(result.measuredSavingsPct).toBe(40);
    expect(result.status).toBe("verified_savings");
    expect(result.claimable).toBe(true);
  });
});
