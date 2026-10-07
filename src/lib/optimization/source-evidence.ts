export type SourceEvidenceConfidence = "verified" | "family_reference" | "ambiguous" | "pending";
export type SourceEvidenceClass = "official_source" | "official_spec" | "first_party_community_post" | "community_reference";

export interface TokenSavingSourceEvidence {
  donorId: string;
  canonicalProject: string;
  repositoryUrl: string;
  sourceClass: SourceEvidenceClass;
  confidence: SourceEvidenceConfidence;
  reviewedOn: string;
  reviewedCommit?: string;
  licenseBoundary?: string;
  notes?: string;
}

/**
 * Canonical identities are deliberately maintained separately from the original
 * Reddit intake names. A `family_reference` can inform a capability design but
 * must not be used as proof that the exact Reddit donor has been identified.
 */
export const TOKEN_SAVING_SOURCE_EVIDENCE: readonly TokenSavingSourceEvidence[] = [
  {
    donorId: "rtk",
    canonicalProject: "rtk-ai/rtk",
    repositoryUrl: "https://github.com/rtk-ai/rtk",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "context-mode",
    canonicalProject: "mksglu/context-mode",
    repositoryUrl: "https://github.com/mksglu/context-mode",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "llmtrim",
    canonicalProject: "fkiene/llmtrim",
    repositoryUrl: "https://github.com/fkiene/llmtrim",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "headroom-desktop",
    canonicalProject: "gglucass/headroom-desktop",
    repositoryUrl: "https://github.com/gglucass/headroom-desktop",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "ponytail",
    canonicalProject: "DietrichGebert/ponytail",
    repositoryUrl: "https://github.com/DietrichGebert/ponytail",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "claude-token-efficient",
    canonicalProject: "drona23/claude-token-efficient",
    repositoryUrl: "https://github.com/drona23/claude-token-efficient",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "grepai",
    canonicalProject: "yoanbernabeu/grepai",
    repositoryUrl: "https://github.com/yoanbernabeu/grepai",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "serena",
    canonicalProject: "oraios/serena",
    repositoryUrl: "https://github.com/oraios/serena",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
    reviewedCommit: "3b99f8b024dafd58c962ea6e74f37c8a730ef532",
    licenseBoundary: "Serena application GPL-3.0-or-later; embedded SolidLSP component MIT. Clean-room behavior mapping only; do not copy GPL application implementation into Token Intelligence.",
  },
  {
    donorId: "repowise",
    canonicalProject: "repowise-dev/repowise",
    repositoryUrl: "https://github.com/repowise-dev/repowise",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
    reviewedCommit: "7f84ae07908de40595fc64b3fe3c910123367a1e",
    licenseBoundary: "AGPL-3.0. Treat as a behavior/benchmark donor only unless separate licensing review authorizes code reuse.",
  },
  {
    donorId: "cocoindex-code",
    canonicalProject: "cocoindex-io/cocoindex-code",
    repositoryUrl: "https://github.com/cocoindex-io/cocoindex-code",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
    reviewedCommit: "b883be0b5d762c9e2d7d82afdedeade5df21d5be",
    licenseBoundary: "Apache-2.0. Token Intelligence still uses clean-room contracts rather than importing donor architecture wholesale.",
  },
  {
    donorId: "semble",
    canonicalProject: "MinishLab/semble",
    repositoryUrl: "https://github.com/MinishLab/semble",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
    reviewedCommit: "44785838c41a026c3c022a0b894b69b32a1e0ac6",
    licenseBoundary: "MIT. Source may inform implementation subject to attribution, but this portfolio continues to use independently designed Token Intelligence contracts.",
  },
  {
    donorId: "jcodemunch-mcp",
    canonicalProject: "jgravelle/jcodemunch-mcp",
    repositoryUrl: "https://github.com/jgravelle/jcodemunch-mcp",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
    reviewedCommit: "95b0cd09652ac14b2806c12c01af7262ae125313",
    licenseBoundary: "Dual-use license: free only for non-commercial use; commercial/for-profit/internal revenue-supporting use requires a paid license. Do not copy implementation into Token Intelligence without explicit commercial-license review.",
  },
  {
    donorId: "mex",
    canonicalProject: "mex-memory/mex",
    repositoryUrl: "https://github.com/mex-memory/mex",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
    notes: "Canonical repo is linked directly from the reviewed Reddit posts; earlier repository ownership changed over time.",
  },
  {
    donorId: "llmlingua-family",
    canonicalProject: "microsoft/LLMLingua",
    repositoryUrl: "https://github.com/microsoft/LLMLingua",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "gptcache",
    canonicalProject: "zilliztech/GPTCache",
    repositoryUrl: "https://github.com/zilliztech/GPTCache",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "lean-format",
    canonicalProject: "fiialkod/lean-format",
    repositoryUrl: "https://github.com/fiialkod/lean-format",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "toon-formatting-plugin",
    canonicalProject: "toon-format/toon",
    repositoryUrl: "https://github.com/toon-format/toon",
    sourceClass: "official_source",
    confidence: "family_reference",
    reviewedOn: "2026-10-06",
    notes: "This verifies the TOON format/reference implementation, not the identity of the Reddit-specific formatting plugin donor.",
  },
  {
    donorId: "toon-mcp-server",
    canonicalProject: "toon-format/spec",
    repositoryUrl: "https://github.com/toon-format/spec",
    sourceClass: "official_spec",
    confidence: "family_reference",
    reviewedOn: "2026-10-06",
    notes: "The format specification is authoritative, but the exact MCP donor still requires identity verification.",
  },
  {
    donorId: "routellm",
    canonicalProject: "lm-sys/RouteLLM",
    repositoryUrl: "https://github.com/lm-sys/RouteLLM",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "litellm",
    canonicalProject: "BerriAI/litellm",
    repositoryUrl: "https://github.com/BerriAI/litellm",
    sourceClass: "official_source",
    confidence: "verified",
    reviewedOn: "2026-10-06",
  },
  {
    donorId: "distill",
    canonicalProject: "unresolved",
    repositoryUrl: "",
    sourceClass: "community_reference",
    confidence: "ambiguous",
    reviewedOn: "2026-10-06",
    notes: "Multiple materially different public projects use the Distill name. The exact Reddit donor remains unresolved.",
  },
  {
    donorId: "mnemos",
    canonicalProject: "unresolved",
    repositoryUrl: "",
    sourceClass: "community_reference",
    confidence: "ambiguous",
    reviewedOn: "2026-10-06",
    notes: "Several unrelated current projects use the Mnemos name. The exact original portfolio donor must be tied back to its Reddit source before source-specific implementation.",
  },
] as const;

export function sourceEvidenceFor(donorId: string): TokenSavingSourceEvidence | null {
  return TOKEN_SAVING_SOURCE_EVIDENCE.find((entry) => entry.donorId === donorId) ?? null;
}

export function canUseSourceAsDonorEvidence(donorId: string): boolean {
  return sourceEvidenceFor(donorId)?.confidence === "verified";
}

export function sourceEvidenceCoverage(donorIds: readonly string[]) {
  const uniqueDonorIds = [...new Set(donorIds)];
  const evidence = uniqueDonorIds.map((donorId) => sourceEvidenceFor(donorId));
  const verified = evidence.filter((entry) => entry?.confidence === "verified").length;
  const familyReference = evidence.filter((entry) => entry?.confidence === "family_reference").length;
  const ambiguous = evidence.filter((entry) => entry?.confidence === "ambiguous").length;
  const pending = evidence.filter((entry) => entry === null || entry.confidence === "pending").length;

  return {
    donors: uniqueDonorIds.length,
    verified,
    familyReference,
    ambiguous,
    pending,
    complete: pending === 0 && ambiguous === 0 && familyReference === 0,
  };
}
