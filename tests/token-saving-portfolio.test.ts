import { describe, expect, it } from "vitest";

import {
  MANDATORY_REVERSE_ENGINEERING_STAGES,
  TOKEN_SAVING_DONORS,
  buildReverseEngineeringWorkBundles,
  canBeginEvidenceCollection,
  canClaimTokenSavings,
  groupDonorsByCapabilityFamily,
} from "@/lib/optimization/token-saving-portfolio";

describe("token-saving reverse-engineering portfolio", () => {
  it("enrolls all 50 compiled donors with stable unique identities", () => {
    expect(TOKEN_SAVING_DONORS).toHaveLength(50);
    expect(new Set(TOKEN_SAVING_DONORS.map((donor) => donor.id)).size).toBe(50);
    expect(TOKEN_SAVING_DONORS.every((donor) => donor.name.trim().length > 0)).toBe(true);
  });

  it("applies the complete evidence-first roadmap to every donor", () => {
    const bundles = buildReverseEngineeringWorkBundles();

    expect(bundles).toHaveLength(TOKEN_SAVING_DONORS.length);
    expect(MANDATORY_REVERSE_ENGINEERING_STAGES).toHaveLength(13);
    for (const bundle of bundles) {
      expect(bundle.stages).toEqual(MANDATORY_REVERSE_ENGINEERING_STAGES);
      expect(bundle.cleanRoomRequired).toBe(true);
      expect(bundle.workerMaySelfApprove).toBe(false);
      expect(bundle.maxParallelWriters).toBe(1);
      expect(bundle.agents).toContain("independent_verifier");
      expect(bundle.agents).toContain("security_privacy_reviewer");
    }
  });

  it("never relabels routing and budget controls as token savings", () => {
    const costOnly = TOKEN_SAVING_DONORS.filter((donor) => donor.claimClass === "cost_reduction_only");
    expect(costOnly.length).toBeGreaterThan(0);

    for (const donor of costOnly) {
      expect(canClaimTokenSavings(donor)).toBe(false);
    }

    const bundles = buildReverseEngineeringWorkBundles(costOnly);
    expect(bundles.every((bundle) => bundle.evidenceGate === "cost_economics_gate")).toBe(true);
  });

  it("requires paired full-session quality evidence for token-saving candidates", () => {
    const tokenCandidates = TOKEN_SAVING_DONORS.filter((donor) => donor.claimClass !== "cost_reduction_only");
    const bundles = buildReverseEngineeringWorkBundles(tokenCandidates);

    expect(bundles.every((bundle) => bundle.evidenceGate === "paired_full_session_quality_gate")).toBe(true);
  });

  it("blocks evidence collection until source identity is verified", () => {
    const pending = TOKEN_SAVING_DONORS.find((donor) => donor.sourceIdentity === "pending_verification");
    const ambiguous = TOKEN_SAVING_DONORS.find((donor) => donor.sourceIdentity === "identity_ambiguous");
    const verified = TOKEN_SAVING_DONORS.find((donor) => donor.sourceIdentity === "verified");

    expect(pending && canBeginEvidenceCollection(pending)).toBe(false);
    expect(ambiguous && canBeginEvidenceCollection(ambiguous)).toBe(false);
    expect(verified && canBeginEvidenceCollection(verified)).toBe(true);
  });

  it("consolidates overlapping donors into owned capability families", () => {
    const families = groupDonorsByCapabilityFamily();

    expect(families["tool-output-reduction"]?.map((donor) => donor.id)).toEqual(expect.arrayContaining(["rtk", "distill"]));
    expect(families["behavior-minimalism"]?.map((donor) => donor.id)).toEqual(expect.arrayContaining(["ponytail", "claude-token-efficient"]));
    expect(families["model-routing"]?.map((donor) => donor.id)).toEqual(expect.arrayContaining(["routellm", "quantum-free-router", "9router"]));
  });
});
