import { expect, test } from "@playwright/test";

const e2eSecret = process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET;
const authenticated = Boolean(e2eSecret && process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED === "1");
const authHeaders: Record<string, string> = e2eSecret ? { "x-ti-e2e-auth": e2eSecret } : {};

test.describe("budget policy and approval control plane", () => {
  test.skip(!authenticated, "Explicit E2E auth adapter is not enabled.");
  test.use({ extraHTTPHeaders: authHeaders });

  test("Budgets page exposes policy authoring and approval queue", async ({ page }) => {
    const response = await page.goto("/app/budgets", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Create policy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Approval queue" })).toBeVisible();
  });

  test("policy creation, policy check, approval request and decision work end to end", async ({ request }) => {
    const suffix = Date.now();
    const policyResponse = await request.post("/api/v1/budgets", {
      data: {
        kind: "policy",
        name: `Release policy ${suffix}`,
        scopeType: "organization",
        priority: 100,
        enabled: true,
        rules: { maxCostUsd: 5, maxTurns: 50, maxRetries: 3, maxToolCalls: 100, disableFallback: true },
      },
    });
    expect(policyResponse.status()).toBe(201);
    const policyId = String((await policyResponse.json()).data.id);

    const check = await request.post("/api/v1/budgets/check", {
      data: { observedCostUsd: 4.9, projectedNextCallCostUsd: 0.2, turns: 10, retries: 0, toolCalls: 20, tokens: 1000 },
    });
    expect(check.status()).toBe(200);
    const checkBody = await check.json();
    expect(checkBody.data).toBeTruthy();

    const requested = await request.post("/api/v1/approvals", {
      data: { policyId, reason: "Release certification approval request" },
    });
    expect(requested.status()).toBe(201);
    const approvalId = String((await requested.json()).data.id);

    const listed = await request.get("/api/v1/approvals");
    expect(listed.status()).toBe(200);
    expect(((await listed.json()).data as Array<{ id: string }>).some((item) => item.id === approvalId)).toBe(true);

    const decided = await request.patch("/api/v1/approvals", {
      data: { id: approvalId, status: "approved", reason: "Approved by release E2E" },
    });
    expect(decided.status()).toBe(200);
    expect((await decided.json()).data.status).toBe("approved");
  });
});
