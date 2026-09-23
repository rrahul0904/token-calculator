import { expect, test } from "@playwright/test";

test("public responses carry launch security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const headers = response.headers();

  expect(headers["x-powered-by"]).toBeUndefined();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");

  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("worker-src 'self' blob:");
});

test("CSP still permits the browser-local tokenizer worker", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Prompt, context, document or code").fill(
    "Launch certification should keep prompt text in the browser while calculating tokens.",
  );

  await expect(page.locator(".summary-number strong")).not.toHaveText("0", { timeout: 10_000 });
  expect(consoleErrors.filter((message) => /content security policy|worker-src|refused to create a worker/i.test(message))).toEqual([]);
});

test("unauthenticated state-changing workspace APIs fail closed", async ({ request }) => {
  const createProject = await request.post("/api/v1/projects", {
    data: { name: "unauthorized-project", description: "must not be created" },
  });
  expect(createProject.status()).toBe(401);

  const createKey = await request.post("/api/v1/api-keys", {
    data: { name: "unauthorized-key", environment: "test", scopes: ["read:usage"] },
  });
  expect(createKey.status()).toBe(401);
});

test("malformed auth callback input does not produce a server error or redirect", async ({ request }) => {
  const response = await request.get("/auth/callback?code=invalid-without-state", { maxRedirects: 0 });
  expect(response.status()).toBe(400);
  const body = await response.text();
  expect(body).toContain("INVALID_AUTH_CALLBACK");
  expect(body).not.toMatch(/stack|postgres:\/\/|WORKOS_API_KEY|STRIPE_SECRET_KEY/i);
});

test("health and API errors do not leak credentials or stack traces", async ({ request }) => {
  for (const path of ["/api/health", "/api/v1/api-keys"]) {
    const response = await request.get(path);
    expect(response.status()).toBeLessThan(500);
    const body = await response.text();
    expect(body).not.toMatch(/postgres:\/\/|sk_(?:live|test)_|whsec_|WORKOS_API_KEY|TOKEN_INTELLIGENCE_ENCRYPTION_KEY|BEGIN (?:RSA )?PRIVATE KEY/i);
    expect(body).not.toMatch(/\n\s+at\s+.+\(.+\)/);
  }
});

test("suspicious traversal and oversized query inputs stay bounded", async ({ request }) => {
  const traversal = await request.get("/api/v1/models/%2e%2e/%2e%2e/etc/passwd");
  expect(traversal.status()).toBeGreaterThanOrEqual(400);
  expect(traversal.status()).toBeLessThan(500);

  const huge = "9".repeat(20_000);
  const response = await request.get("/?tokens=" + huge);
  expect(response.status()).toBeLessThan(500);
});
