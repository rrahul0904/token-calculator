import { expect, test } from "@playwright/test";

const e2eSecret = process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET;
const authenticated = Boolean(e2eSecret && process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED === "1");
const authHeaders: Record<string, string> = e2eSecret ? { "x-ti-e2e-auth": e2eSecret } : {};

test.describe("saved scenario history", () => {
  test.skip(!authenticated, "Explicit E2E auth adapter is not enabled.");
  test.use({ extraHTTPHeaders: authHeaders });

  test("Cost Lab exposes the saved-scenario manager", async ({ page }) => {
    const response = await page.goto("/app/cost-lab", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Saved scenario history" })).toBeVisible();
  });

  test("create, list, rename, duplicate and delete scenario metadata", async ({ request }) => {
    const suffix = Date.now();
    const created = await request.post("/api/v1/scenarios", {
      data: {
        name: `Scenario ${suffix}`,
        projectId: "proj_e2e",
        scenario: { inputTokensA: 1000, inputTokensB: 800, outputTokens: 300, promptContentStored: false },
        promptHashA: "a".repeat(64),
        promptHashB: "b".repeat(64),
      },
    });
    expect(created.status()).toBe(201);
    const scenario = (await created.json()).data as { id: string };

    const listed = await request.get("/api/v1/scenarios");
    expect(listed.status()).toBe(200);
    expect(((await listed.json()).data as Array<{ id: string }>).some((item) => item.id === scenario.id)).toBe(true);

    const renamed = await request.patch(`/api/v1/scenarios/${scenario.id}`, { data: { name: `Renamed ${suffix}` } });
    expect(renamed.status()).toBe(200);
    expect((await renamed.json()).data.name).toBe(`Renamed ${suffix}`);

    const duplicated = await request.patch(`/api/v1/scenarios/${scenario.id}`, { data: { duplicate: true, name: `Copy ${suffix}` } });
    expect(duplicated.status()).toBe(201);
    const copy = (await duplicated.json()).data as { id: string };
    expect(copy.id).not.toBe(scenario.id);

    expect((await request.delete(`/api/v1/scenarios/${scenario.id}`)).status()).toBe(200);
    expect((await request.delete(`/api/v1/scenarios/${copy.id}`)).status()).toBe(200);
  });
});
