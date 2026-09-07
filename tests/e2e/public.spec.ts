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
  { path: "/models/gpt-5.6-sol", marker: /GPT-5\.6 Sol pricing/i },
  { path: "/models/gemini-3.7-flash/pricing-history", marker: /Gemini 3\.7 Flash pricing history/i },
  { path: "/compare/gpt-5.6-sol/vs/claude-sonnet-5", marker: /GPT-5\.6 Sol vs Claude Sonnet 5/i },
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
  expect(body).toContain("/models/gpt-5.6-sol");
  expect(body).toContain("/models/gemini-3.7-flash/pricing-history");
  expect(body).toContain("/compare/gpt-5.6-sol/vs/claude-sonnet-5");
});


test("calculator exposes tokenizer precision and bounded token inspection", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Prompt, context, document or code").fill("hello world from the local tokenizer");
  await expect(page.getByText("Provider reference", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Inspect token boundaries/i)).toBeVisible();

  await page.getByLabel("Planning model").selectOption("claude-sonnet-5");
  await expect(page.getByText("Planning estimate", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Token-piece inspection is unavailable/i)).toBeVisible();
});

test("safe shared workload restores numeric state and can surface context overflow", async ({ page }) => {
  await page.goto("/?mode=tokens&tokens=2000000&outputPct=50&cached=40&requests=100000&model=gpt-5.6-sol", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#token-count")).toHaveValue("2000000");
  await expect(page.getByLabel("Planning model")).toHaveValue("gpt-5.6-sol");
  await expect(page.getByLabel("Cached input percentage")).toHaveValue("40");
  await expect(page.getByLabel("Requests per month")).toHaveValue("100000");
  await expect(page.locator(".calculator-summary")).toContainText("Overflow");
});

test("copy scenario link never copies pasted prompt content", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3000" });
  const sentinel = "PRIVATE_SHARE_SENTINEL_3185b6";
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Prompt, context, document or code").fill(sentinel);
  await page.getByRole("button", { name: "Copy scenario link" }).click();
  await expect(page.getByRole("status")).toContainText(/without prompt content/i);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("mode=tokens");
  expect(copied).not.toContain(sentinel);
  expect(copied).not.toContain("text=");
  expect(copied).not.toContain("prompt");
});

test("primary calculator controls have semantic accessible names", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Prompt, context, document or code")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Planning model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy scenario link" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Switch to .* theme/i })).toBeVisible();
});

test("critical public routes avoid page-level horizontal overflow at required mobile widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Explicit viewport matrix runs once; the suite also runs under mobile Chromium.");
  const sizes = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ];
  const routes = [
    "/",
    "/models",
    "/models/gpt-5.6-sol",
    "/models/gemini-3.7-flash/pricing-history",
    "/compare/gpt-5.6-sol/vs/claude-sonnet-5",
    "/guides",
    "/guides/openai",
    "/guides/anthropic",
    "/guides/gemini",
    "/tools/cost",
    "/tools/tokens-words",
    "/tools/memory",
    "/tools/speed",
    "/developers",
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), route + " at " + size.width + "px").toBeLessThan(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, route + " at " + size.width + "px").toBeLessThanOrEqual(1);
    }
  }
});


test("model detail exposes provenance, tokenizer certainty, canonical metadata and structured data", async ({ page }) => {
  await page.goto("/models/gpt-5.6-sol", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("GPT-5.6 Sol");
  await expect(page.getByText("Provider reference", { exact: true })).toBeVisible();
  await expect(page.getByText(/Official source/i)).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/models\/gpt-5\.6-sol$/);
  const structured = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(structured.join("\n")).toContain("BreadcrumbList");
});

test("pricing history shows represented promotion and scheduled standard rate", async ({ page }) => {
  await page.goto("/models/gemini-3.7-flash/pricing-history", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText("2026-12-31");
  await expect(page.locator("body")).toContainText("2027-01-01");
  await expect(page.locator("body")).toContainText(/future scheduled|current/i);
});

test("comparison query restores safe workload and canonical reverse routes redirect", async ({ page }) => {
  await page.goto("/compare/gpt-5.6-sol/vs/claude-sonnet-5?input=123456&output=7890&cached=40&requests=50000", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Comparison input tokens")).toHaveValue("123456");
  await expect(page.getByLabel("Comparison output tokens")).toHaveValue("7890");
  await expect(page.getByLabel("Comparison cached percent")).toHaveValue("40");
  await expect(page.getByLabel("Comparison requests per month")).toHaveValue("50000");
  await expect(page.locator("body")).toContainText("Lower price does not imply equivalent quality");

  await page.goto("/compare/claude-sonnet-5/vs/gpt-5.6-sol", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/compare\/gpt-5\.6-sol\/vs\/claude-sonnet-5$/);
});

test("comparison share link contains workload numbers only", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3000" });
  await page.goto("/compare/gpt-5.6-sol/vs/claude-sonnet-5?input=111&output=22&cached=33&requests=44", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Copy comparison link" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("input=111");
  expect(copied).toContain("output=22");
  expect(copied).not.toMatch(/prompt|text=|api[_-]?key|bearer/i);
});

test("developer page exposes public API quickstarts and package-source caveat", async ({ page }) => {
  await page.goto("/developers", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText("/api/v1/models/:id");
  await expect(page.locator("body")).toContainText("npm install @token-intelligence/sdk");
  await expect(page.locator("body")).toContainText("pip install token-intelligence");
  await expect(page.locator("body")).toContainText(/does not claim registry publication status/i);
});
