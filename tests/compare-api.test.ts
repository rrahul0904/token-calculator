import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/v1/compare/route";

async function post(body: unknown) {
  return POST(new Request("http://localhost/api/v1/compare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("/api/v1/compare validation", () => {
  it("rejects malformed comparison input", async () => {
    const response = await post({ a: { inputTokens: -1, outputTokens: 1 }, b: { inputTokens: 1, outputTokens: 1 } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_REQUEST" });
  });

  it("keeps comparison economics explicitly outcome-unverified", async () => {
    const response = await post({
      a: { inputTokens: 1000, outputTokens: 200, modelIds: ["gpt-5.6-sol"] },
      b: { inputTokens: 800, outputTokens: 200, modelIds: ["gpt-5.6-sol"] },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcomeVerified).toBe(false);
    expect(body.warning).toMatch(/quality|verified/i);
  });
});
