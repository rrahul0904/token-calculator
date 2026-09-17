import { expect, test } from "@playwright/test";

const e2eSecret = process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET;
const authenticated = Boolean(e2eSecret && process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED === "1");
const authHeaders: Record<string, string> = e2eSecret ? { "x-ti-e2e-auth": e2eSecret } : {};

test.describe("premium economics surfaces", () => {
  test.skip(!authenticated, "Explicit E2E auth adapter is not enabled.");
  test.use({ extraHTTPHeaders: authHeaders });

  for (const item of [
    { path: "/app/findings", title: /findings/i },
    { path: "/app/route-lab", title: /route lab/i },
    { path: "/app/experiments", title: /experiments/i },
  ]) {
    test(`${item.path} renders with truthful evidence states`, async ({ page }) => {
      const response = await page.goto(item.path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(item.title);
      await expect(page.locator("body")).not.toContainText(/internal server error/i);
      await expect(page.locator("body")).not.toContainText(/you saved money/i);
    });
  }
});
