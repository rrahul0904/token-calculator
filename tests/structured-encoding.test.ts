import { describe, expect, it } from "vitest";

import { evaluateStructuredEncoding } from "@/lib/optimization/structured-encoding";

describe("structured encoding evidence", () => {
  it("reports payload compression without promoting it to session savings", () => {
    const result = evaluateStructuredEncoding({
      id: "toon-payload",
      format: "toon-like",
      measurementScope: "payload_only",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      fidelityGate: "verified",
      sampleSize: 10,
      baselinePayloadTokens: 10_000,
      encodedPayloadTokens: 6_000,
      requiredFields: ["id", "name"],
      preservedFields: ["id", "name"],
    });

    expect(result.payloadSavingsPct).toBe(40);
    expect(result.status).toBe("payload_reduction_only");
    expect(result.claimable).toBe(false);
  });

  it("fails closed when required structure is lost", () => {
    const result = evaluateStructuredEncoding({
      id: "lossy-format",
      format: "compact",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      fidelityGate: "verified",
      sampleSize: 8,
      baselinePayloadTokens: 5_000,
      encodedPayloadTokens: 3_000,
      baselineSessionTokens: 20_000,
      candidateSessionTokens: 12_000,
      requiredFields: ["amount", "currency", "account_id"],
      preservedFields: ["amount", "currency"],
    });

    expect(result.status).toBe("fidelity_failure");
    expect(result.missingFields).toEqual(["account_id"]);
    expect(result.claimable).toBe(false);
  });

  it("charges format instruction, repair and retry tokens to the candidate", () => {
    const result = evaluateStructuredEncoding({
      id: "repair-heavy",
      format: "custom-format",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      fidelityGate: "verified",
      sampleSize: 10,
      baselinePayloadTokens: 4_000,
      encodedPayloadTokens: 2_000,
      baselineSessionTokens: 10_000,
      candidateSessionTokens: 6_000,
      formatInstructionTokens: 1_000,
      decodeRepairTokens: 2_000,
      retryTokens: 2_000,
    });

    expect(result.netCandidateSessionTokens).toBe(11_000);
    expect(result.status).toBe("token_regression");
    expect(result.claimable).toBe(false);
  });

  it("requires fidelity and task quality verification", () => {
    const fidelity = evaluateStructuredEncoding({
      id: "fidelity-not-run",
      format: "format-a",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      fidelityGate: "not_run",
      sampleSize: 10,
      baselinePayloadTokens: 5_000,
      encodedPayloadTokens: 3_000,
      baselineSessionTokens: 15_000,
      candidateSessionTokens: 10_000,
    });
    expect(fidelity.status).toBe("fidelity_unverified");

    const quality = evaluateStructuredEncoding({
      id: "quality-not-run",
      format: "format-b",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "not_run",
      fidelityGate: "verified",
      sampleSize: 10,
      baselinePayloadTokens: 5_000,
      encodedPayloadTokens: 3_000,
      baselineSessionTokens: 15_000,
      candidateSessionTokens: 10_000,
    });
    expect(quality.status).toBe("quality_unverified");
  });

  it("verifies savings only after full-session, fidelity and quality gates pass", () => {
    const result = evaluateStructuredEncoding({
      id: "verified-format",
      format: "clean-room-encoding",
      formatVersion: "1",
      measurementScope: "full_session",
      evidenceType: "measured_before_after",
      qualityGate: "passed",
      fidelityGate: "verified",
      sampleSize: 12,
      baselinePayloadTokens: 8_000,
      encodedPayloadTokens: 5_000,
      baselineSessionTokens: 30_000,
      candidateSessionTokens: 20_000,
      formatInstructionTokens: 500,
      decodeRepairTokens: 200,
      retryTokens: 300,
      requiredFields: ["id", "name"],
      preservedFields: ["name", "id"],
      evidenceSource: "paired-run-receipts",
    });

    expect(result.payloadSavingsPct).toBe(37.5);
    expect(result.netCandidateSessionTokens).toBe(21_000);
    expect(result.measuredSessionSavingsTokens).toBe(9_000);
    expect(result.measuredSessionSavingsPct).toBe(30);
    expect(result.status).toBe("verified_savings");
    expect(result.claimable).toBe(true);
    expect(result.verificationRequired).toBeNull();
  });
});
