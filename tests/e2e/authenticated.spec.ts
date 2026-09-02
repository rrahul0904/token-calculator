import { expect, test } from "@playwright/test";

const e2eSecret = process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const authenticated = Boolean(e2eSecret && process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED === "1");

const authHeaders: Record<string, string> = e2eSecret ? { "x-ti-e2e-auth": e2eSecret } : {};

test.describe("authenticated workspace", () => {
  test.skip(!authenticated, "Explicit E2E auth adapter is not enabled.");
  test.use({ extraHTTPHeaders: authHeaders });

  const workspacePages = [
    "/app/overview",
    "/app/projects",
    "/app/runs",
    "/app/usage",
    "/app/cost-lab",
    "/app/integrations",
    "/app/budgets",
    "/app/api-keys",
    "/app/team",
    "/app/settings",
    "/app/billing",
    "/app/audit",
    "/app/finops",
  ];

  for (const path of workspacePages) {
    test(`${path} renders for the seeded owner`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator("body")).not.toContainText(/workspace is code-complete but not configured/i);
      await expect(page.locator("body")).not.toContainText(/internal server error/i);
    });
  }

  test("project lifecycle is tenant scoped", async ({ request }) => {
    const name = `Playwright Project ${Date.now()}`;
    const created = await request.post("/api/v1/projects", { data: { name, description: "Authenticated release E2E" } });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.data?.name).toBe(name);

    const listed = await request.get("/api/v1/projects");
    expect(listed.status()).toBe(200);
    const body = await listed.json();
    const ids = new Set((body.data ?? []).map((project: { id: string }) => project.id));
    expect(ids.has(createdBody.data.id)).toBe(true);
    expect(ids.has("proj_e2e_other")).toBe(false);
  });

  test("API key is shown once, works, rotates, and revokes", async ({ request }) => {
    const created = await request.post("/api/v1/api-keys", {
      data: {
        name: `Playwright key ${Date.now()}`,
        environment: "test",
        projectId: "proj_e2e",
        scopes: ["read:usage"],
        requestsPerMinute: 20,
        monthlyTokenLimit: 100000,
        monthlyCostLimitUsd: 25,
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    const keyId = String(createdBody.data.id);
    const initialSecret = String(createdBody.data.secret);
    expect(initialSecret.length).toBeGreaterThan(20);

    const list = await request.get("/api/v1/api-keys");
    expect(list.status()).toBe(200);
    expect(JSON.stringify(await list.json())).not.toContain(initialSecret);

    const usageWithInitial = await fetch(`${baseUrl}/api/v1/usage?days=1`, {
      headers: { authorization: `Bearer ${initialSecret}` },
    });
    expect(usageWithInitial.status).toBe(200);

    const rotated = await request.patch(`/api/v1/api-keys/${keyId}`, { data: { action: "rotate" } });
    expect(rotated.status()).toBe(200);
    const rotatedBody = await rotated.json();
    const replacementSecret = String(rotatedBody.data.secret);
    expect(replacementSecret).not.toBe(initialSecret);

    const oldSecretAfterRotation = await fetch(`${baseUrl}/api/v1/usage?days=1`, {
      headers: { authorization: `Bearer ${initialSecret}` },
    });
    expect(oldSecretAfterRotation.status).toBe(401);

    const replacementWorks = await fetch(`${baseUrl}/api/v1/usage?days=1`, {
      headers: { authorization: `Bearer ${replacementSecret}` },
    });
    expect(replacementWorks.status).toBe(200);

    const revoked = await request.delete(`/api/v1/api-keys/${keyId}`);
    expect(revoked.status()).toBe(200);

    const replacementAfterRevoke = await fetch(`${baseUrl}/api/v1/usage?days=1`, {
      headers: { authorization: `Bearer ${replacementSecret}` },
    });
    expect(replacementAfterRevoke.status).toBe(401);
  });

  test("privacy controls stay metadata-only and never overstate residency", async ({ request }) => {
    const initial = await request.get("/api/v1/settings/data-controls");
    expect(initial.status()).toBe(200);
    const initialBody = await initial.json();
    expect(initialBody.data.privacyMode).toBe("metadata_only");
    expect(initialBody.data.privacyModes.find((item: { mode: string }) => item.mode === "full_content")?.available).toBe(false);

    const rejected = await request.patch("/api/v1/settings/data-controls", { data: { privacyMode: "full_content", requestedDataRegion: "us-east-1" } });
    expect(rejected.status()).toBe(409);

    const updated = await request.patch("/api/v1/settings/data-controls", { data: { privacyMode: "metadata_only", requestedDataRegion: "us-east-1" } });
    expect(updated.status()).toBe(200);
    const body = await updated.json();
    expect(body.data.privacyMode).toBe("metadata_only");
    expect(body.data.residencyClaim).not.toMatch(/^verified:/);
  });

  test("retention settings persist independently of content persistence", async ({ request }) => {
    const updated = await request.patch("/api/v1/settings/retention", {
      data: { telemetryDays: 45, runDays: 180, findingDays: 180, auditDays: 730, enabled: true },
    });
    expect(updated.status()).toBe(200);
    const body = await updated.json();
    expect(body.data.telemetryDays).toBe(45);
    expect(body.data.auditDays).toBe(730);

    const readBack = await request.get("/api/v1/settings/retention");
    expect(readBack.status()).toBe(200);
    const readBody = await readBack.json();
    expect(readBody.data.telemetryDays).toBe(45);
    expect(readBody.data.runDays).toBe(180);
  });
});

test("session-only API routes reject an unauthenticated request", async ({ request }) => {
  const response = await request.get("/api/v1/api-keys");
  expect(response.status()).toBe(401);
});
