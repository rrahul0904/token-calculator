import { describe, expect, it } from "vitest";

import {
  TOKEN_SAVING_SOURCE_EVIDENCE,
  canUseSourceAsDonorEvidence,
  sourceEvidenceCoverage,
  sourceEvidenceFor,
} from "@/lib/optimization/source-evidence";
import { TOKEN_SAVING_DONORS } from "@/lib/optimization/token-saving-portfolio";

describe("token-saving donor source evidence", () => {
  it("keeps exact donor verification distinct from family references", () => {
    expect(canUseSourceAsDonorEvidence("llmlingua-family")).toBe(true);
    expect(canUseSourceAsDonorEvidence("toon-formatting-plugin")).toBe(false);
    expect(sourceEvidenceFor("toon-formatting-plugin")?.confidence).toBe("family_reference");
  });

  it("blocks ambiguous names from source-specific implementation", () => {
    expect(canUseSourceAsDonorEvidence("distill")).toBe(false);
    expect(canUseSourceAsDonorEvidence("mnemos")).toBe(false);
    expect(sourceEvidenceFor("distill")?.confidence).toBe("ambiguous");
    expect(sourceEvidenceFor("mnemos")?.confidence).toBe("ambiguous");
  });

  it("records canonical verified sources for reviewed major families", () => {
    expect(sourceEvidenceFor("context-mode")?.canonicalProject).toBe("mksglu/context-mode");
    expect(sourceEvidenceFor("gptcache")?.canonicalProject).toBe("zilliztech/GPTCache");
    expect(sourceEvidenceFor("routellm")?.canonicalProject).toBe("lm-sys/RouteLLM");
    expect(sourceEvidenceFor("litellm")?.canonicalProject).toBe("BerriAI/litellm");
    expect(sourceEvidenceFor("mex")?.canonicalProject).toBe("mex-memory/mex");
  });

  it("reports portfolio source-identification progress without pretending it is complete", () => {
    const coverage = sourceEvidenceCoverage(TOKEN_SAVING_DONORS.map((donor) => donor.id));

    expect(coverage.donors).toBe(50);
    expect(coverage.verified).toBeGreaterThan(0);
    expect(coverage.pending).toBeGreaterThan(0);
    expect(coverage.complete).toBe(false);
  });

  it("does not contain duplicate donor source-evidence identities", () => {
    const ids = TOKEN_SAVING_SOURCE_EVIDENCE.map((entry) => entry.donorId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
