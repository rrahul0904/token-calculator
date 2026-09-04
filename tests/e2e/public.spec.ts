import { expect, test } from "@playwright/test";

const publicPages = [
  { path: "/", marker: /Token Intelligence/i },
  { path: "/models", marker: /model/i },
  { path: "/pricing", marker: /pricing|plan/i },
  { path: "/developers", marker: /developer|API/i },
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

test("workspace redirects unauthenticated traffic to the explicit auth configuration state", async ({ page }) => {
  const response = await page.goto("/app/overview", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/sign-in");
  expect(response?.status()).toBe(503);
  await expect(page.locator("body")).toContainText(/auth_not_configured|authkit is code-complete but configuration-blocked/i);
});
