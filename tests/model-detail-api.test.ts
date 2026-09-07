import { describe, expect, it } from "vitest";
import { GET as getModelDetail } from "@/app/api/v1/models/[id]/route";
import { GET as getPricingHistory } from "@/app/api/v1/models/[id]/pricing-history/route";

describe("public model discovery APIs", () => {
  it("returns normalized model detail with effective pricing and tokenizer precision", async () => {
    const response = await getModelDetail(new Request("http://localhost/api/v1/models/gpt-5.6-sol"), { params: Promise.resolve({ id: "gpt-5.6-sol" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      id: "gpt-5.6-sol",
      provider: "OpenAI",
      tokenizer: { precision: "provider_reference" },
      pricing: { current: { input: 4, cachedInput: 0.4, output: 20 } },
    });
  });

  it("returns stable 404 errors for unknown models", async () => {
    const response = await getModelDetail(new Request("http://localhost/api/v1/models/nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "NOT_FOUND", errorDetail: { code: "NOT_FOUND" } });
  });

  it("returns only represented pricing history", async () => {
    const response = await getPricingHistory(new Request("http://localhost/api/v1/models/gemini-3.7-flash/pricing-history"), { params: Promise.resolve({ id: "gemini-3.7-flash" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.model.id).toBe("gemini-3.7-flash");
    expect(body.data.history.length).toBe(2);
    expect(JSON.stringify(body)).toContain("2026-12-31");
  });
});
