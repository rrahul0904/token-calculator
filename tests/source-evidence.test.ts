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

  it("pins repository-intelligence donors to exact reviewed commits", () => {
    expect(sourceEvidenceFor("serena")?.canonicalProject).toBe("oraios/serena");
    expect(sourceEvidenceFor("serena")?.reviewedCommit).toBe("3b99f8b024dafd58c962ea6e74f37c8a730ef532");
    expect(sourceEvidenceFor("repowise")?.reviewedCommit).toBe("7f84ae07908de40595fc64b3fe3c910123367a1e");
    expect(sourceEvidenceFor("cocoindex-code")?.reviewedCommit).toBe("b883be0b5d762c9e2d7d82afdedeade5df21d5be");
    expect(sourceEvidenceFor("semble")?.reviewedCommit).toBe("44785838c41a026c3c022a0b894b69b32a1e0ac6");
    expect(sourceEvidenceFor("jcodemunch-mcp")?.reviewedCommit).toBe("95b0cd09652ac14b2806c12c01af7262ae125313");
  });

  it("preserves restrictive license boundaries in source evidence", () => {
    expect(sourceEvidenceFor("serena")?.licenseBoundary).toContain("GPL-3.0-or-later");
    expect(sourceEvidenceFor("repowise")?.licenseBoundary).toContain("AGPL-3.0");
    expect(sourceEvidenceFor("cocoindex-code")?.licenseBoundary).toContain("Apache-2.0");
    expect(sourceEvidenceFor("semble")?.licenseBoundary).toContain("MIT");
    expect(sourceEvidenceFor("jcodemunch-mcp")?.licenseBoundary).toContain("paid license");
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
