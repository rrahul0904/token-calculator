import {
  TOKEN_SAVING_DONORS,
  type TokenSavingDonor,
  type TokenSavingTechnique,
} from "./token-saving-portfolio";

export type NativeTokenSavingEvaluator =
  | "output_reduction"
  | "context_compression"
  | "structured_encoding"
  | "prompt_cache_economics"
  | "repository_context"
  | "persistent_memory"
  | "response_density"
  | "semantic_cache"
  | "routing_economics"
  | "budget_control"
  | "orchestration_efficiency";

export const NATIVE_EVALUATOR_BY_TECHNIQUE: Readonly<Record<TokenSavingTechnique, NativeTokenSavingEvaluator>> = {
  output_reduction: "output_reduction",
  context_compression: "context_compression",
  structured_encoding: "structured_encoding",
  prompt_cache_optimization: "prompt_cache_economics",
  repository_retrieval: "repository_context",
  persistent_memory: "persistent_memory",
  behavior_minimalism: "response_density",
  semantic_cache: "semantic_cache",
  model_routing: "routing_economics",
  budget_control: "budget_control",
  agent_orchestration: "orchestration_efficiency",
} as const;

export interface DonorCapabilityCoverage {
  donorId: string;
  donorName: string;
  technique: TokenSavingTechnique;
  familyKey: string;
  evaluator: NativeTokenSavingEvaluator;
  sourceIdentity: TokenSavingDonor["sourceIdentity"];
  implementationStrategy: "clean_room_family_consolidation";
}

export interface CapabilityCoverageReport {
  donorCount: number;
  techniqueCount: number;
  evaluatorCount: number;
  complete: boolean;
  uncoveredDonorIds: string[];
  coveredTechniques: TokenSavingTechnique[];
  evaluators: NativeTokenSavingEvaluator[];
  donors: DonorCapabilityCoverage[];
}

/**
 * Proves product-surface coverage, not donor verification. A donor can be
 * source-ambiguous and still be assigned to an owned clean-room capability
 * family; source ambiguity continues to block donor-specific evidence claims.
 */
export function buildCapabilityCoverageReport(
  donors: readonly TokenSavingDonor[] = TOKEN_SAVING_DONORS,
): CapabilityCoverageReport {
  const mapped = donors.flatMap<DonorCapabilityCoverage>((donor) => {
    const evaluator = NATIVE_EVALUATOR_BY_TECHNIQUE[donor.technique];
    return evaluator ? [{
      donorId: donor.id,
      donorName: donor.name,
      technique: donor.technique,
      familyKey: donor.familyKey,
      evaluator,
      sourceIdentity: donor.sourceIdentity,
      implementationStrategy: "clean_room_family_consolidation" as const,
    }] : [];
  });
  const mappedIds = new Set(mapped.map((entry) => entry.donorId));
  const uncoveredDonorIds = donors.filter((donor) => !mappedIds.has(donor.id)).map((donor) => donor.id).sort();
  const coveredTechniques = [...new Set(mapped.map((entry) => entry.technique))].sort() as TokenSavingTechnique[];
  const evaluators = [...new Set(mapped.map((entry) => entry.evaluator))].sort() as NativeTokenSavingEvaluator[];

  return {
    donorCount: donors.length,
    techniqueCount: coveredTechniques.length,
    evaluatorCount: evaluators.length,
    complete: uncoveredDonorIds.length === 0,
    uncoveredDonorIds,
    coveredTechniques,
    evaluators,
    donors: mapped,
  };
}
