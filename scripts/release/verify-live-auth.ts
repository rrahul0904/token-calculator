import { chromium } from "@playwright/test";
import process from "node:process";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string, fallback?: string) {
  const value = argument(name) ?? fallback;
  if (!value?.trim()) throw new Error(`MISSING_LIVE_AUTH_INPUT:${name}`);
  return value.trim();
}

const baseUrl = required("base-url").replace(/\/$/, "");
const baseOrigin = new URL(baseUrl).origin;
const email = required("email", process.env.RELEASE_AUTH_EMAIL);
const password = required("password", process.env.RELEASE_AUTH_PASSWORD);
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

if (bypass) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const requestOrigin = new URL(request.url()).origin;
    if (requestOrigin !== baseOrigin) return route.continue();
    await route.continue({
      headers: {
        ...request.headers(),
        "x-vercel-protection-bypass": bypass,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
  });
}

const page = await context.newPage();
try {
  await page.goto(`${baseUrl}/app/overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (new URL(page.url()).origin === baseOrigin) {
    throw new Error("LIVE_AUTH_EXPECTED_HOSTED_SIGN_IN_REDIRECT");
  }

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  await emailInput.fill(email);

  let passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  if (!(await passwordInput.isVisible().catch(() => false))) {
    const continueButton = page.getByRole("button", { name: /continue|sign in|log in/i }).first();
    await continueButton.click();
    passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.waitFor({ state: "visible", timeout: 15_000 });
  }

  await passwordInput.fill(password);
  await page.getByRole("button", { name: /continue|sign in|log in/i }).first().click();

  await page.waitForURL((url) => url.origin === baseOrigin, { timeout: 30_000 });
  await page.goto(`${baseUrl}/app/overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (new URL(page.url()).origin !== baseOrigin) throw new Error("LIVE_AUTH_SESSION_NOT_ESTABLISHED");

  const body = await page.locator("body").innerText();
  if (/AUTH_NOT_CONFIGURED|internal server error/i.test(body)) throw new Error("LIVE_AUTH_WORKSPACE_FAILED");

  await page.goto(`${baseUrl}/sign-out`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.goto(`${baseUrl}/app/overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForURL((url) => url.origin !== baseOrigin, { timeout: 20_000 });

  process.stdout.write(JSON.stringify({
    provider: "workos-authkit",
    certified: true,
    baseOrigin,
    signIn: "PASS",
    callback: "PASS",
    authenticatedWorkspace: "PASS",
    signOut: "PASS",
    postSignOutProtection: "PASS",
  }, null, 2) + "\n");
} finally {
  await context.close();
  await browser.close();
}
