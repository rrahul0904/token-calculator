import { expect, test } from "@playwright/test";

const publicPages = [
  { path: "/", marker: /Token Intelligence/i },
  { path: "/models", marker: /model/i },
  { path: "/pricing", marker: /pricing|plan/i },
  { path: "/developers", marker: /developer|API/i },
  { path: "/guides", marker: /provider guides|pricing/i },
  { path: "/guides/openai", marker: /OpenAI token cost/i },
  { path: "/guides/anthropic", marker: /Claude token cost/i },
  { path: "/guides/gemini", marker: /Gemini token cost/i },
];

for (const pageCase of publicPages) {
  test(`${pageCase.path} renders without a server error`, async ({ page }) => {
    const response = await page.goto(pageCase.path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toContainText(pageCase.marker);
  });
}

test("health endpoint reaches PostgreSQL without leaking secrets", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.application).toBe("ok");
  expect(body.database).toBe("ok");
  expect(body.mcp).toBe("ok");
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain("postgres://");
  expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
});

test("OpenAPI document is valid 3.1 metadata and served as JSON", async ({ request }) => {
  const response = await request.get("/openapi.json");
  expect(response.status()).toBe(200);
  const document = await response.json();
  expect(document.openapi).toBe("3.1.0");
  expect(document.info?.title).toBe("Token Intelligence API");
  expect(document.paths).toBeTruthy();
});

test("workspace does not produce a server error when auth is intentionally absent", async ({ page }) => {
  const response = await page.goto("/app/overview", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator("body")).toContainText(/workspace|configuration|sign in/i);
});


test("anonymous calculator does not send pasted text in network request bodies", async ({ page }) => {
  const sentinel = "PRIVATE_PROMPT_SENTINEL_9f1c7d2a";
  const leakedRequests: string[] = [];

  page.on("request", (request) => {
    const body = request.postData();
    if (body?.includes(sentinel)) leakedRequests.push(request.url());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Prompt, context, document or code").fill(sentinel);
  await expect(page.locator(".metrics-strip")).toContainText(/Tokens/i);
  await page.waitForTimeout(250);

  expect(leakedRequests).toEqual([]);
});

test("sitemap exposes the public calculator, tools, and provider guides", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("/models");
  expect(body).toContain("/tools/cost");
  expect(body).toContain("/guides/openai");
  expect(body).toContain("/guides/anthropic");
  expect(body).toContain("/guides/gemini");
});


test("reference-style workload deep link round-trips and supports reverse mode", async ({ page, request }) => {
  const path = "/tools/cost?model=glm-5.3-flash&mode=tokens2cost&tokens=1000000000&input=99&cache=98";
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByLabel("Total tokens")).toHaveValue("1000000000");
  await expect(page.getByLabel("Input percent")).toHaveValue("99");
  await expect(page.getByLabel("Cache hit percent")).toHaveValue("98");
  await expect(page.getByTestId("workload-cost-lab")).toContainText("$18.54");
  expect(page.url()).toContain("model=glm-5.3-flash");
  expect(page.url()).toContain("cache=98");

  await page.getByRole("button", { name: "Cost → tokens" }).click();
  await expect(page.getByLabel("Budget (USD)")).toBeVisible();
  expect(page.url()).toContain("mode=cost2tokens");

  const api = await request.post("/api/v1/economics/estimate", {
    data: {
      mode: "tokens2cost",
      modelId: "glm-5.3-flash",
      totalTokens: 1000000000,
      budgetUsd: 100,
      inputPercent: 99,
      cacheHitPercent: 98,
      cacheableInputPercent: 100,
      cacheWrite5mPercent: 0,
      cacheWrite1hPercent: 0,
      requestsPerMonth: 1
    }
  });
  expect(api.status()).toBe(200);
  const body = await api.json();
  expect(body.data.cost.totalUsd).toBeCloseTo(18.538);
});

test("workload cost lab remains usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/cost?model=glm-5.3-flash&tokens=1000000&input=90&cache=50", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("workload-cost-lab")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
