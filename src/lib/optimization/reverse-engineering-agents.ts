import type {
  ReverseEngineeringAgentRole,
  ReverseEngineeringStage,
  TokenSavingDonor,
} from "./token-saving-portfolio";

export interface ReverseEngineeringAgentSpec {
  role: ReverseEngineeringAgentRole;
  mayWriteProductCode: boolean;
  maySelfApprove: false;
  responsibilities: readonly string[];
  requiredOutputs: readonly string[];
  escalateOn: readonly string[];
}

export interface ReverseEngineeringAgentAssignment {
  donorId: string;
  stage: ReverseEngineeringStage;
  owner: ReverseEngineeringAgentRole;
  reviewers: readonly ReverseEngineeringAgentRole[];
  writeAccess: "none" | "bounded_product_slice";
  completionRequiresEvidence: true;
}

export const REVERSE_ENGINEERING_AGENT_SPECS: readonly ReverseEngineeringAgentSpec[] = [
  {
    role: "supervisor",
    mayWriteProductCode: false,
    maySelfApprove: false,
    responsibilities: ["order work", "deduplicate capability families", "enforce exact evidence lineage", "make go/no-go decisions"],
    requiredOutputs: ["work order", "dependency decisions", "terminal disposition"],
    escalateOn: ["ambiguous source identity", "conflicting evidence", "production promotion"],
  },
  {
    role: "source_researcher",
    mayWriteProductCode: false,
    maySelfApprove: false,
    responsibilities: ["resolve canonical post/repository/docs/license", "record source snapshot", "separate upstream claims from observed behavior"],
    requiredOutputs: ["source identity", "source class", "evidence references", "claim inventory"],
    escalateOn: ["name collision", "deleted source", "unclear license or provenance"],
  },
  {
    role: "feedback_analyst",
    mayWriteProductCode: false,
    maySelfApprove: false,
    responsibilities: ["capture user feedback", "identify failure modes", "record contradictory evidence"],
    requiredOutputs: ["pain points", "failure reports", "feedback provenance"],
    escalateOn: ["safety concern", "unreproducible headline claim"],
  },
  {
    role: "architecture_reviewer",
    mayWriteProductCode: false,
    maySelfApprove: false,
    responsibilities: ["map donor behavior to existing Token Intelligence primitives", "reject duplicate subsystems", "define clean-room boundary"],
    requiredOutputs: ["capability map", "reuse decision", "explicit exclusions", "acceptance boundary"],
    escalateOn: ["new gateway", "new telemetry ledger", "new savings ledger", "cross-tenant data path"],
  },
  {
    role: "implementation_worker",
    mayWriteProductCode: true,
    maySelfApprove: false,
    responsibilities: ["implement one bounded clean-room slice", "add deterministic tests", "report exact changed paths and verification"],
    requiredOutputs: ["changed paths", "tests", "verification commands", "risks", "exact head SHA"],
    escalateOn: ["security/auth/payments/tenancy change", "destructive migration", "credential requirement", "scope expansion"],
  },
  {
    role: "benchmark_verifier",
    mayWriteProductCode: false,
    maySelfApprove: false,
    responsibilities: ["run paired cohorts", "include retries/setup/overhead", "enforce quality gates", "separate token and cost economics"],
    requiredOutputs: ["baseline receipts", "candidate receipts", "quality result", "claim classification"],
    escalateOn: ["unpaired workload", "missing provider usage", "quality regression", "mixed measurement scope"],
  },
  {
    role: "security_privacy_reviewer",
    mayWriteProductCode: false,
    maySelfApprove: false,
    responsibilities: ["review raw-content boundaries", "review proxy/interception risk", "review fail-closed behavior", "review tenant/secret exposure"],
    requiredOutputs: ["privacy decision", "threat notes", "security blockers"],
    escalateOn: ["local CA", "transparent interception", "secret persistence", "cross-tenant access", "raw prompt/source retention"],
  },
  {
    role: "independent_verifier",
    mayWriteProductCode: false,
    maySelfApprove: false,
    responsibilities: ["review exact head independently", "check tests and non-claims", "confirm evidence matches implementation"],
    requiredOutputs: ["verification verdict", "exact SHA", "remaining blockers"],
    escalateOn: ["worker self-approval", "stale SHA", "missing hosted evidence", "unsupported savings claim"],
  },
] as const;

const STAGE_OWNER: Record<ReverseEngineeringStage, ReverseEngineeringAgentRole> = {
  source_identification: "source_researcher",
  evidence_collection: "source_researcher",
  workflow_reconstruction: "source_researcher",
  capability_failure_decomposition: "feedback_analyst",
  feedback_pain_point_analysis: "feedback_analyst",
  competitive_comparison: "architecture_reviewer",
  internal_primitive_audit: "architecture_reviewer",
  product_thesis_boundary: "supervisor",
  behavior_contracts_acceptance_tests: "architecture_reviewer",
  clean_room_implementation: "implementation_worker",
  independent_verification: "independent_verifier",
  hosted_recovery_certification: "security_privacy_reviewer",
  evidence_backed_tracker_update: "supervisor",
};

const STAGE_REVIEWERS: Partial<Record<ReverseEngineeringStage, readonly ReverseEngineeringAgentRole[]>> = {
  source_identification: ["supervisor"],
  evidence_collection: ["feedback_analyst"],
  product_thesis_boundary: ["architecture_reviewer"],
  behavior_contracts_acceptance_tests: ["benchmark_verifier", "security_privacy_reviewer"],
  clean_room_implementation: ["architecture_reviewer", "security_privacy_reviewer"],
  independent_verification: ["benchmark_verifier", "security_privacy_reviewer"],
  hosted_recovery_certification: ["independent_verifier"],
  evidence_backed_tracker_update: ["independent_verifier"],
};

export function buildDonorAgentAssignments(
  donor: TokenSavingDonor,
  stages: readonly ReverseEngineeringStage[],
): ReverseEngineeringAgentAssignment[] {
  return stages.map((stage) => ({
    donorId: donor.id,
    stage,
    owner: STAGE_OWNER[stage],
    reviewers: STAGE_REVIEWERS[stage] ?? ["supervisor"],
    writeAccess: stage === "clean_room_implementation" ? "bounded_product_slice" : "none",
    completionRequiresEvidence: true,
  }));
}
