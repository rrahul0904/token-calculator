import {
  TOKEN_SAVING_DONORS,
  type TokenSavingDonor,
} from "./token-saving-portfolio";
import {
  sourceEvidenceFor,
  type SourceEvidenceConfidence,
} from "./source-evidence";

export interface SourceIdentificationTask {
  donorId: string;
  donorName: string;
  familyKey: string;
  confidence: SourceEvidenceConfidence | "missing";
  priority: "high" | "medium" | "low";
  reason: string;
  requiredOutputs: readonly [
    "canonical_reddit_source",
    "canonical_repository_or_official_source",
    "license_or_usage_boundary",
    "reviewed_snapshot_or_commit",
    "claim_inventory",
  ];
  nextAllowedStage: "source_identification";
  evidenceCollectionAllowed: false;
  sourceSpecificImplementationAllowed: false;
}

function priorityFor(confidence: SourceIdentificationTask["confidence"]): SourceIdentificationTask["priority"] {
  if (confidence === "ambiguous") return "high";
  if (confidence === "missing" || confidence === "pending") return "medium";
  return "low";
}

function reasonFor(donor: TokenSavingDonor, confidence: SourceIdentificationTask["confidence"]): string {
  const evidence = sourceEvidenceFor(donor.id);
  if (confidence === "ambiguous") return evidence?.notes ?? "Multiple candidate sources exist; exact donor provenance must be resolved.";
  if (confidence === "family_reference") return evidence?.notes ?? "Only the underlying technique/source family is verified; the exact Reddit donor remains unresolved.";
  if (confidence === "pending") return evidence?.notes ?? "Source identification is pending.";
  return "No canonical source-evidence entry exists yet for this donor.";
}

/**
 * Return only donors that still require source-identification work. Exact donor
 * implementation is mechanically disallowed for every task in this backlog.
 */
export function buildSourceIdentificationBacklog(
  donors: readonly TokenSavingDonor[] = TOKEN_SAVING_DONORS,
): SourceIdentificationTask[] {
  return donors
    .flatMap((donor) => {
      const evidence = sourceEvidenceFor(donor.id);
      const confidence: SourceIdentificationTask["confidence"] = evidence?.confidence ?? "missing";
      if (confidence === "verified") return [];
      return [{
        donorId: donor.id,
        donorName: donor.name,
        familyKey: donor.familyKey,
        confidence,
        priority: priorityFor(confidence),
        reason: reasonFor(donor, confidence),
        requiredOutputs: [
          "canonical_reddit_source",
          "canonical_repository_or_official_source",
          "license_or_usage_boundary",
          "reviewed_snapshot_or_commit",
          "claim_inventory",
        ] as const,
        nextAllowedStage: "source_identification" as const,
        evidenceCollectionAllowed: false as const,
        sourceSpecificImplementationAllowed: false as const,
      }];
    })
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return rank[a.priority] - rank[b.priority] || a.donorName.localeCompare(b.donorName);
    });
}
