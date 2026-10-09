export type TokenSavingTechnique =
  | "output_reduction"
  | "context_compression"
  | "structured_encoding"
  | "prompt_cache_optimization"
  | "repository_retrieval"
  | "persistent_memory"
  | "behavior_minimalism"
  | "semantic_cache"
  | "model_routing"
  | "budget_control"
  | "agent_orchestration";

export type TokenSavingClaimClass =
  | "token_reduction_candidate"
  | "cost_reduction_only"
  | "mixed_token_and_cost_candidate";

export type SourceIdentityStatus =
  | "verified"
  | "identity_ambiguous"
  | "pending_verification";

export type ReverseEngineeringTerminalStatus =
  | "integrated_capability"
  | "benchmark_only"
  | "duplicate_consolidated"
  | "excluded"
  | "blocked";

export type ReverseEngineeringStage =
  | "source_identification"
  | "evidence_collection"
  | "workflow_reconstruction"
  | "capability_failure_decomposition"
  | "feedback_pain_point_analysis"
  | "competitive_comparison"
  | "internal_primitive_audit"
  | "product_thesis_boundary"
  | "behavior_contracts_acceptance_tests"
  | "clean_room_implementation"
  | "independent_verification"
  | "hosted_recovery_certification"
  | "evidence_backed_tracker_update";

export type ReverseEngineeringAgentRole =
  | "supervisor"
  | "source_researcher"
  | "feedback_analyst"
  | "architecture_reviewer"
  | "implementation_worker"
  | "benchmark_verifier"
  | "security_privacy_reviewer"
  | "independent_verifier";

export interface TokenSavingDonor {
  id: string;
  name: string;
  technique: TokenSavingTechnique;
  claimClass: TokenSavingClaimClass;
  sourceIdentity: SourceIdentityStatus;
  familyKey: string;
  notes?: string;
}

export interface ReverseEngineeringWorkBundle {
  donorId: string;
  donorName: string;
  familyKey: string;
  technique: TokenSavingTechnique;
  stages: readonly ReverseEngineeringStage[];
  agents: readonly ReverseEngineeringAgentRole[];
  evidenceGate: "paired_full_session_quality_gate" | "cost_economics_gate";
  cleanRoomRequired: true;
  workerMaySelfApprove: false;
  maxParallelWriters: 1;
  sourceIdentity: SourceIdentityStatus;
}

export const MANDATORY_REVERSE_ENGINEERING_STAGES: readonly ReverseEngineeringStage[] = [
  "source_identification",
  "evidence_collection",
  "workflow_reconstruction",
  "capability_failure_decomposition",
  "feedback_pain_point_analysis",
  "competitive_comparison",
  "internal_primitive_audit",
  "product_thesis_boundary",
  "behavior_contracts_acceptance_tests",
  "clean_room_implementation",
  "independent_verification",
  "hosted_recovery_certification",
  "evidence_backed_tracker_update",
] as const;

export const REVERSE_ENGINEERING_AGENT_ROLES: readonly ReverseEngineeringAgentRole[] = [
  "supervisor",
  "source_researcher",
  "feedback_analyst",
  "architecture_reviewer",
  "implementation_worker",
  "benchmark_verifier",
  "security_privacy_reviewer",
  "independent_verifier",
] as const;

/**
 * Portfolio intake from the Reddit token-saving landscape review.
 *
 * `sourceIdentity` deliberately separates an intake name from a verified source.
 * A pending or ambiguous identity must not be used as product evidence.
 * Percentages or marketing claims from donors are intentionally not stored here.
 */
export const TOKEN_SAVING_DONORS: readonly TokenSavingDonor[] = [
  { id: "rtk", name: "RTK / Rust Token Killer", technique: "output_reduction", claimClass: "token_reduction_candidate", sourceIdentity: "verified", familyKey: "tool-output-reduction" },
  { id: "context-mode", name: "Context Mode", technique: "context_compression", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "tool-output-virtualization" },
  { id: "distill", name: "Distill", technique: "output_reduction", claimClass: "token_reduction_candidate", sourceIdentity: "identity_ambiguous", familyKey: "tool-output-reduction", notes: "Multiple public projects use this name; source identity must be disambiguated before evidence collection." },
  { id: "llmtrim", name: "llmtrim", technique: "context_compression", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "request-context-compression" },
  { id: "headroom", name: "Headroom", technique: "context_compression", claimClass: "token_reduction_candidate", sourceIdentity: "verified", familyKey: "request-context-compression" },
  { id: "headroom-desktop", name: "Headroom Desktop", technique: "context_compression", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "request-context-compression" },
  { id: "claude-token-efficient", name: "claude-token-efficient", technique: "behavior_minimalism", claimClass: "token_reduction_candidate", sourceIdentity: "verified", familyKey: "behavior-minimalism" },
  { id: "virtual-context", name: "Virtual Context", technique: "context_compression", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "tool-output-virtualization" },
  { id: "mana", name: "Mana", technique: "context_compression", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "context-management" },
  { id: "caveman", name: "Caveman", technique: "behavior_minimalism", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "behavior-minimalism" },
  { id: "ponytail", name: "Ponytail", technique: "behavior_minimalism", claimClass: "token_reduction_candidate", sourceIdentity: "verified", familyKey: "behavior-minimalism" },
  { id: "claude-code-cache-fix", name: "claude-code-cache-fix", technique: "prompt_cache_optimization", claimClass: "mixed_token_and_cost_candidate", sourceIdentity: "pending_verification", familyKey: "prompt-cache-efficiency" },
  { id: "toon-formatting-plugin", name: "TOON Formatting Plugin", technique: "structured_encoding", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "structured-encoding" },
  { id: "toon-mcp-server", name: "TOON MCP Server", technique: "structured_encoding", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "structured-encoding" },
  { id: "lean-format", name: "LEAN format", technique: "structured_encoding", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "structured-encoding" },

  { id: "grepai", name: "GrepAI", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-retrieval" },
  { id: "jcodemunch-mcp", name: "jCodeMunch MCP", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "symbol-retrieval" },
  { id: "codebase-memory-mcp", name: "codebase-memory-mcp", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "code-knowledge-graph" },
  { id: "serena", name: "Serena", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "symbol-retrieval" },
  { id: "cocoindex-code", name: "CocoIndex Code", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-retrieval" },
  { id: "code-review-graph", name: "code-review-graph", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "code-knowledge-graph" },
  { id: "token-savior", name: "Token Savior", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "symbol-retrieval" },
  { id: "repowise", name: "Repowise", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-intelligence" },
  { id: "unerr-cli", name: "unerr-cli", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "code-knowledge-graph" },
  { id: "mex", name: "Mex", technique: "persistent_memory", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-memory" },
  { id: "semble", name: "Semble", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-retrieval" },
  { id: "slicegrep", name: "SliceGrep", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "token-budgeted-retrieval" },
  { id: "claude-code-lsp-enforcement-kit", name: "Claude Code LSP Enforcement Kit", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "symbol-retrieval" },
  { id: "sdl-mcp", name: "SDL-MCP", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "code-knowledge-graph" },
  { id: "ai-codex", name: "ai-codex", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-index" },
  { id: "cymbal", name: "Cymbal", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-index" },
  { id: "pampa", name: "Pampa", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-index" },
  { id: "pampax", name: "Pampax", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-index" },
  { id: "directory-indexer", name: "directory-indexer", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "repository-index" },
  { id: "graperoot", name: "GrapeRoot", technique: "repository_retrieval", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "code-knowledge-graph" },

  { id: "mnemos", name: "Mnemos", technique: "persistent_memory", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "agent-memory" },
  { id: "memstack", name: "Memstack", technique: "persistent_memory", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "agent-memory" },
  { id: "hollow-agentos", name: "Hollow AgentOS", technique: "agent_orchestration", claimClass: "mixed_token_and_cost_candidate", sourceIdentity: "pending_verification", familyKey: "agent-orchestration" },
  { id: "save-the-tokens", name: "SaveTheTokens", technique: "agent_orchestration", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "agent-guardrails" },
  { id: "opencode-plugin-claude", name: "OpenCode Plugin for Claude Code", technique: "model_routing", claimClass: "cost_reduction_only", sourceIdentity: "pending_verification", familyKey: "model-routing" },
  { id: "ncp", name: "NCP", technique: "context_compression", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "context-management" },
  { id: "tokenblast", name: "TokenBlast", technique: "budget_control", claimClass: "cost_reduction_only", sourceIdentity: "pending_verification", familyKey: "budget-control" },
  { id: "igpt-ai", name: "iGPT AI", technique: "context_compression", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "external-context-structuring" },

  { id: "gptcache", name: "GPTCache", technique: "semantic_cache", claimClass: "mixed_token_and_cost_candidate", sourceIdentity: "pending_verification", familyKey: "semantic-cache" },
  { id: "llmlingua-family", name: "LLMLingua / LongLLMLingua / LLMLingua-2", technique: "context_compression", claimClass: "token_reduction_candidate", sourceIdentity: "pending_verification", familyKey: "prompt-compression" },
  { id: "routellm", name: "RouteLLM", technique: "model_routing", claimClass: "cost_reduction_only", sourceIdentity: "pending_verification", familyKey: "model-routing" },
  { id: "litellm", name: "LiteLLM", technique: "model_routing", claimClass: "cost_reduction_only", sourceIdentity: "pending_verification", familyKey: "model-gateway" },
  { id: "steadio", name: "SteadIO", technique: "budget_control", claimClass: "cost_reduction_only", sourceIdentity: "pending_verification", familyKey: "budget-control" },
  { id: "quantum-free-router", name: "Quantum Free Router", technique: "model_routing", claimClass: "cost_reduction_only", sourceIdentity: "pending_verification", familyKey: "model-routing" },
  { id: "9router", name: "9router", technique: "model_routing", claimClass: "cost_reduction_only", sourceIdentity: "pending_verification", familyKey: "model-routing" },
] as const;

function evidenceGateFor(claimClass: TokenSavingClaimClass): ReverseEngineeringWorkBundle["evidenceGate"] {
  return claimClass === "cost_reduction_only"
    ? "cost_economics_gate"
    : "paired_full_session_quality_gate";
}

export function buildReverseEngineeringWorkBundles(
  donors: readonly TokenSavingDonor[] = TOKEN_SAVING_DONORS,
): ReverseEngineeringWorkBundle[] {
  return donors.map((donor) => ({
    donorId: donor.id,
    donorName: donor.name,
    familyKey: donor.familyKey,
    technique: donor.technique,
    stages: MANDATORY_REVERSE_ENGINEERING_STAGES,
    agents: REVERSE_ENGINEERING_AGENT_ROLES,
    evidenceGate: evidenceGateFor(donor.claimClass),
    cleanRoomRequired: true,
    workerMaySelfApprove: false,
    maxParallelWriters: 1,
    sourceIdentity: donor.sourceIdentity,
  }));
}

export function groupDonorsByCapabilityFamily(
  donors: readonly TokenSavingDonor[] = TOKEN_SAVING_DONORS,
): Record<string, TokenSavingDonor[]> {
  return donors.reduce<Record<string, TokenSavingDonor[]>>((groups, donor) => {
    (groups[donor.familyKey] ??= []).push(donor);
    return groups;
  }, {});
}

export function canClaimTokenSavings(donor: TokenSavingDonor): boolean {
  return donor.claimClass !== "cost_reduction_only";
}

export function canBeginEvidenceCollection(donor: TokenSavingDonor): boolean {
  return donor.sourceIdentity === "verified";
}
