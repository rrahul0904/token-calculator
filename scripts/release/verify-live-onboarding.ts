import { chromium } from "@playwright/test";
import postgres from "postgres";
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
  if (!value?.trim()) throw new Error(`MISSING_ONBOARDING_INPUT:${name}`);
  return value.trim();
}

const baseUrl = required("base-url").replace(/\/$/, "");
const baseOrigin = new URL(baseUrl).origin;
const email = required("email", process.env.RELEASE_ONBOARDING_AUTH_EMAIL);
const password = required("password", process.env.RELEASE_ONBOARDING_AUTH_PASSWORD);
const organizationName = argument("organization-name") ?? `Release Certification ${Date.now()}`;
const projectName = argument("project-name") ?? "Release certification project";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const cleanupAllowed = process.env.RELEASE_ONBOARDING_CLEANUP_ALLOWED === "1";
const databaseUrl = process.env.DATABASE_URL?.trim();

async function cleanupPreviewFixture() {
  if (!cleanupAllowed) return;
  if (!databaseUrl) throw new Error("MISSING_ONBOARDING_CLEANUP_DATABASE_URL");
  if (baseOrigin === "https://token-intelligence-eight.vercel.app") {
    throw new Error("ONBOARDING_CLEANUP_REFUSES_PRODUCTION");
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    connect_timeout: 15,
  });
  try {
    await sql.begin(async (tx) => {
      const rows = await tx<{ organization_id: string }[]>`
        select distinct om.organization_id
        from organization_members om
        inner join users u on u.id = om.user_id
        inner join organizations o on o.id = om.organization_id
        where lower(u.email) = lower(${email})
          and o.name = ${organizationName}
      `;
      for (const row of rows) {
        await tx`delete from organizations where id = ${row.organization_id}`;
      }
      await tx`
        delete from users
        where lower(email) = lower(${email})
          and not exists (
            select 1 from organization_members om where om.user_id = users.id
          )
      `;
    });
  } finally {
    await sql.end({ timeout: 3 });
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
if (bypass) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== baseOrigin) return route.continue();
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
  if (new URL(page.url()).origin === baseOrigin) throw new Error("ONBOARDING_EXPECTED_HOSTED_SIGN_IN");

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  await emailInput.fill(email);

  let passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  if (!(await passwordInput.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /continue|sign in|log in/i }).first().click();
    passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.waitFor({ state: "visible", timeout: 15_000 });
  }
  await passwordInput.fill(password);
  await page.getByRole("button", { name: /continue|sign in|log in/i }).first().click();

  await page.waitForURL((url) => url.origin === baseOrigin, { timeout: 30_000 });
  await page.goto(`${baseUrl}/app/overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  const organizationInput = page.locator("#organization-name");
  await organizationInput.waitFor({ state: "visible", timeout: 15_000 });
  await organizationInput.fill(organizationName);
  await page.locator("#project-name").fill(projectName);
  await page.getByRole("button", { name: /create workspace/i }).click();

  await page.waitForFunction(
    () => !document.querySelector("#organization-name"),
    undefined,
    { timeout: 20_000 },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  if (await page.locator("#organization-name").isVisible().catch(() => false)) {
    throw new Error("ONBOARDING_NOT_IDEMPOTENT_AFTER_REFRESH");
  }

  const body = await page.locator("body").innerText();
  if (/internal server error|ONBOARDING_FAILED|AUTH_IDENTITY_CONFLICT/i.test(body)) {
    throw new Error("ONBOARDING_WORKSPACE_FAILED");
  }

  process.stdout.write(JSON.stringify({
    provider: "workos-authkit",
    certified: true,
    flow: "first-user-onboarding",
    baseOrigin,
    signIn: "PASS",
    callback: "PASS",
    organizationCreation: "PASS",
    firstProjectCreation: "PASS",
    refreshIdempotency: "PASS",
    previewFixtureCleanup: cleanupAllowed ? "ENABLED" : "DISABLED",
  }, null, 2) + "\n");
} finally {
  await context.close();
  await browser.close();
  await cleanupPreviewFixture();
}
