import { expect, test } from "@playwright/test";

const e2eSecret = process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET;
const authenticated = Boolean(e2eSecret && process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED === "1");
const authHeaders: Record<string, string> = e2eSecret ? { "x-ti-e2e-auth": e2eSecret } : {};

test("new visitor can calculate locally and discover the core product surfaces", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByLabel("Prompt, context, document or code").fill(
    "Estimate the token footprint and monthly cost of this launch-readiness workflow.",
  );
  await expect(page.locator(".summary-number strong")).not.toHaveText("0", { timeout: 10_000 });

  await page.getByRole("link", { name: "Cost Lab", exact: true }).first().click();
  await expect(page).toHaveURL(/\/tools\/cost/);
  await expect(page.locator("main")).toBeVisible();

  await page.getByRole("link", { name: "Models", exact: true }).click();
  await expect(page).toHaveURL(/\/models$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/model/i);

  await page.getByRole("link", { name: "Developers", exact: true }).click();
  await expect(page).toHaveURL(/\/developers$/);
  await expect(page.locator("body")).toContainText(/API|SDK|developer/i);
});

test("public product is keyboard reachable through its primary navigation", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    label: document.activeElement?.getAttribute("aria-label"),
    text: document.activeElement?.textContent?.trim(),
  }));
  expect(firstFocus.tag).toMatch(/A|BUTTON/);

  for (let i = 0; i < 12; i += 1) await page.keyboard.press("Tab");
  const focusedInteractive = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return Boolean(element && ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(element.tagName));
  });
  expect(focusedInteractive).toBe(true);
});

test.describe("owner acceptance journey", () => {
  test.skip(!authenticated, "Explicit local E2E auth adapter is not enabled.");
  test.use({ extraHTTPHeaders: authHeaders });

  test("owner can move from overview to analysis, experiments, and controls", async ({ page }) => {
    await page.goto("/app/overview", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "Route Lab", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/route-lab$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Route Lab/i);

    await page.getByRole("link", { name: "Experiments", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/experiments$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Experiments/i);

    await page.getByRole("link", { name: "Budgets & policies", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/budgets$/);
    await expect(page.getByRole("heading", { name: "Create policy" })).toBeVisible();
  });

  test("mobile owner can use the workspace drawer without layout failure", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/overview", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("complementary", { name: "Mobile workspace navigation" })).toBeVisible();
    await page.getByRole("complementary", { name: "Mobile workspace navigation" })
      .getByRole("link", { name: "Route Lab", exact: true })
      .click();

    await expect(page).toHaveURL(/\/app\/route-lab$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Route Lab/i);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
