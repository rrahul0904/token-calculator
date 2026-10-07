import type { ReverseEngineeringTerminalStatus } from "./token-saving-portfolio";
import type { SourceEvidenceConfidence } from "./source-evidence";

export type LifecycleGateStatus = "passed" | "failed" | "not_run" | "not_applicable";

export interface DonorLifecycleEvidence {
  donorId: string;
  sourceConfidence: SourceEvidenceConfidence;
  behaviorContracts: LifecycleGateStatus;
  cleanRoomImplementation: LifecycleGateStatus;
  independentVerification: LifecycleGateStatus;
  hostedCertificationRequired: boolean;
  hostedCertification: LifecycleGateStatus;
  benchmarkEvidence: LifecycleGateStatus;
  duplicateOf?: string | null;
  exclusionReason?: string | null;
  blockedReason?: string | null;
}

export interface DonorLifecycleDecision {
  donorId: string;
  requestedStatus: ReverseEngineeringTerminalStatus;
  allowed: boolean;
  blockers: string[];
  evidenceSummary: {
    sourceVerified: boolean;
    contractsPassed: boolean;
    implementationPassed: boolean;
    independentVerificationPassed: boolean;
    hostedCertificationSatisfied: boolean;
    benchmarkEvidencePassed: boolean;
  };
}

function sourceVerified(confidence: SourceEvidenceConfidence): boolean {
  return confidence === "verified";
}

function hostedSatisfied(evidence: DonorLifecycleEvidence): boolean {
  return !evidence.hostedCertificationRequired
    || evidence.hostedCertification === "passed"
    || evidence.hostedCertification === "not_applicable";
}

/**
 * Enforce truthful terminal portfolio states. A donor can only become an
 * integrated capability after exact provenance, contracts, implementation,
 * independent verification and any required hosted certification have passed.
 * Duplicate, excluded, benchmark-only and blocked dispositions have their own
 * explicit evidence requirements and never imply implementation parity.
 */
export function evaluateDonorTerminalTransition(
  evidence: DonorLifecycleEvidence,
  requestedStatus: ReverseEngineeringTerminalStatus,
): DonorLifecycleDecision {
  const blockers: string[] = [];
  const sourceIsVerified = sourceVerified(evidence.sourceConfidence);
  const contractsPassed = evidence.behaviorContracts === "passed";
  const implementationPassed = evidence.cleanRoomImplementation === "passed";
  const verificationPassed = evidence.independentVerification === "passed";
  const hostedCertificationSatisfied = hostedSatisfied(evidence);
  const benchmarkEvidencePassed = evidence.benchmarkEvidence === "passed";

  if (requestedStatus === "integrated_capability") {
    if (!sourceIsVerified) blockers.push("source_identity_not_verified");
    if (!contractsPassed) blockers.push("behavior_contracts_not_passed");
    if (!implementationPassed) blockers.push("clean_room_implementation_not_passed");
    if (!verificationPassed) blockers.push("independent_verification_not_passed");
    if (!hostedCertificationSatisfied) blockers.push("hosted_certification_not_passed");
  } else if (requestedStatus === "benchmark_only") {
    if (!sourceIsVerified && evidence.sourceConfidence !== "family_reference") blockers.push("benchmark_source_not_resolved");
    if (!benchmarkEvidencePassed) blockers.push("benchmark_evidence_not_passed");
  } else if (requestedStatus === "duplicate_consolidated") {
    if (!evidence.duplicateOf?.trim()) blockers.push("duplicate_target_required");
    if (!contractsPassed) blockers.push("capability_mapping_not_verified");
  } else if (requestedStatus === "excluded") {
    if (!evidence.exclusionReason?.trim()) blockers.push("exclusion_reason_required");
  } else if (requestedStatus === "blocked") {
    if (!evidence.blockedReason?.trim()) blockers.push("blocked_reason_required");
  }

  return {
    donorId: evidence.donorId,
    requestedStatus,
    allowed: blockers.length === 0,
    blockers,
    evidenceSummary: {
      sourceVerified: sourceIsVerified,
      contractsPassed,
      implementationPassed,
      independentVerificationPassed: verificationPassed,
      hostedCertificationSatisfied,
      benchmarkEvidencePassed,
    },
  };
}
