import { describe, expect, it } from "vitest";

import { buildSourceIdentificationBacklog } from "@/lib/optimization/source-identification-backlog";
import { TOKEN_SAVING_DONORS } from "@/lib/optimization/token-saving-portfolio";

describe("source identification backlog", () => {
  it("contains only unresolved donors and blocks later stages", () => {
    const backlog = buildSourceIdentificationBacklog();

    expect(backlog.length).toBeGreaterThan(0);
    expect(backlog.every((task) => task.nextAllowedStage === "source_identification")).toBe(true);
    expect(backlog.every((task) => task.evidenceCollectionAllowed === false)).toBe(true);
    expect(backlog.every((task) => task.sourceSpecificImplementationAllowed === false)).toBe(true);
  });

  it("prioritizes ambiguous donor names ahead of missing or family-reference identities", () => {
    const backlog = buildSourceIdentificationBacklog();
    const distill = backlog.find((task) => task.donorId === "distill");
    const mnemos = backlog.find((task) => task.donorId === "mnemos");
    const toon = backlog.find((task) => task.donorId === "toon-formatting-plugin");

    expect(distill?.priority).toBe("high");
    expect(mnemos?.priority).toBe("high");
    expect(toon?.priority).toBe("low");
    expect(backlog.findIndex((task) => task.donorId === "distill")).toBeLessThan(backlog.findIndex((task) => task.donorId === "toon-formatting-plugin"));
  });

  it("does not include verified canonical donors", () => {
    const ids = new Set(buildSourceIdentificationBacklog().map((task) => task.donorId));

    expect(ids.has("context-mode")).toBe(false);
    expect(ids.has("llmlingua-family")).toBe(false);
    expect(ids.has("gptcache")).toBe(false);
    expect(ids.has("routellm")).toBe(false);
    expect(ids.has("litellm")).toBe(false);
  });

  it("requires the complete source-research output packet", () => {
    const task = buildSourceIdentificationBacklog()[0];
    expect(task.requiredOutputs).toEqual([
      "canonical_reddit_source",
      "canonical_repository_or_official_source",
      "license_or_usage_boundary",
      "reviewed_snapshot_or_commit",
      "claim_inventory",
    ]);
  });

  it("keeps the backlog tied to the registered donor portfolio", () => {
    const portfolioIds = new Set(TOKEN_SAVING_DONORS.map((donor) => donor.id));
    expect(buildSourceIdentificationBacklog().every((task) => portfolioIds.has(task.donorId))).toBe(true);
  });
});
