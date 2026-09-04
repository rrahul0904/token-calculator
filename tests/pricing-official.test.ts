import { describe, expect, it } from "vitest";
import { reviewedOfficialEndpoints } from "@/lib/pricing/official";
import { endpointsForModel } from "@/lib/pricing/catalog";

describe("direct provider pricing adapters", () => {
  it("normalizes reviewed first-party catalog entries as direct endpoints", () => {
    const endpoints = reviewedOfficialEndpoints();
    expect(endpoints.length).toBeGreaterThan(5);
    expect(endpoints.every((endpoint) => endpoint.provenance.sourceType === "official_provider")).toBe(true);
    expect(endpoints.every((endpoint) => endpoint.provenance.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("keeps routed and direct endpoint identity separate for GLM", () => {
    const endpoints = endpointsForModel("glm-5.3-flash");
    expect(endpoints.some((endpoint) => endpoint.id === "openrouter:z-ai/glm-5.3-flash")).toBe(true);
    expect(endpoints.some((endpoint) => endpoint.id.startsWith("direct:"))).toBe(true);
  });
});
