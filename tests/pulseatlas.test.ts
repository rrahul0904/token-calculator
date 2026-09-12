import { describe, expect, it } from "vitest";
import { redactedPulseAtlasPath } from "@/lib/pulseatlas";

describe("PulseAtlas path redaction", () => {
  it("keeps only approved static paths", () => {
    expect(redactedPulseAtlasPath("/models?tab=providers#pricing")).toBe("/models");
    expect(redactedPulseAtlasPath("/unexpected/customer-value")).toBe("/other");
  });

  it("replaces customer-controlled route identifiers", () => {
    expect(redactedPulseAtlasPath("/app/projects/proj_customer_123")).toBe("/app/projects/:project");
    expect(redactedPulseAtlasPath("/app/runs/run_customer_456?token=secret")).toBe("/app/runs/:run");
  });
});
