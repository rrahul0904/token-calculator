import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import postgres from "postgres";
import Stripe from "stripe";
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
  if (!value?.trim()) throw new Error(`MISSING_LIVE_BILLING_INPUT:${name}`);
  return value.trim();
}

const baseUrl = required("base-url").replace(/\/$/, "");
const baseOrigin = new URL(baseUrl).origin;
if (baseOrigin === "https://token-intelligence-eight.vercel.app") {
  throw new Error("LIVE_BILLING_REFUSES_PRODUCTION");
}

const email = required("email", process.env.RELEASE_AUTH_EMAIL);
const password = required("password", process.env.RELEASE_AUTH_PASSWORD);
const databaseUrl = required("database-url", process.env.DATABASE_URL);
const stripeKey = required("stripe-key", process.env.STRIPE_SECRET_KEY);
const webhookSecret = required("webhook-secret", process.env.STRIPE_WEBHOOK_SECRET);
const proPrice = required("pro-price", process.env.STRIPE_PRICE_PRO);
const teamPrice = required("team-price", process.env.STRIPE_PRICE_TEAM);
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

if (!stripeKey.includes("_test_")) throw new Error("LIVE_BILLING_REQUIRES_STRIPE_TEST_MODE");

const stripe = new Stripe(stripeKey, {
  appInfo: { name: "Token Intelligence Preview billing verifier", version: "0.3.0" },
});
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  connect_timeout: 15,
});

const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
const subscriptionId = `sub_release_${suffix}`;
const eventIds = {
  created: `evt_release_created_${suffix}`,
  updated: `evt_release_updated_${suffix}`,
  deleted: `evt_release_deleted_${suffix}`,
};
let organizationId: string | null = null;
let originalPlan: string | null = null;
let originalCustomerId: string | null = null;
let customerId: string | null = null;
let checkoutSessionId: string | null = null;

function bypassHeaders(extra: Record<string, string> = {}) {
  return bypass
    ? {
        ...extra,
        "x-vercel-protection-bypass": bypass,
        "x-vercel-set-bypass-cookie": "true",
      }
    : extra;
}

async function planForOrganization() {
  if (!organizationId) return null;
  return (await sql<{ plan: string }[]>`select plan from organizations where id = ${organizationId}`)[0]?.plan ?? null;
}

async function postSignedStripeEvent(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: "POST",
    body: payload,
    headers: bypassHeaders({
      "content-type": "application/json",
      "stripe-signature": signature,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LIVE_BILLING_WEBHOOK_HTTP_${response.status}:${body.slice(0, 160)}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

function subscriptionEvent(id: string, type: string, status: string, priceId: string, seats: number, created: number) {
  if (!organizationId || !customerId) throw new Error("LIVE_BILLING_FIXTURE_NOT_READY");
  return {
    id,
    object: "event",
    type,
    created,
    livemode: false,
    data: {
      object: {
        id: subscriptionId,
        object: "subscription",
        customer: customerId,
        status,
        cancel_at_period_end: false,
        metadata: { organization_id: organizationId },
        items: {
          data: [{
            quantity: seats,
            current_period_end: created + 86_400,
            price: { id: priceId },
          }],
        },
      },
    },
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

if (bypass) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== baseOrigin) return route.continue();
    await route.continue({ headers: bypassHeaders(request.headers()) });
  });
}

const page = await context.newPage();
try {
  await page.goto(`${baseUrl}/app/overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (new URL(page.url()).origin === baseOrigin) throw new Error("LIVE_BILLING_EXPECTED_HOSTED_SIGN_IN");

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

  const tenant = (await sql<{
    organization_id: string;
    plan: string;
    stripe_customer_id: string | null;
  }[]>`
    select o.id as organization_id, o.plan, bc.stripe_customer_id
    from users u
    inner join organization_members om on om.user_id = u.id
    inner join organizations o on o.id = om.organization_id
    left join billing_customers bc on bc.organization_id = o.id
    where lower(u.email) = lower(${email})
    order by om.created_at asc
    limit 1
  `)[0];
  if (!tenant) throw new Error("LIVE_BILLING_RELEASE_USER_NOT_ONBOARDED");
  organizationId = tenant.organization_id;
  originalPlan = tenant.plan;
  originalCustomerId = tenant.stripe_customer_id;

  const checkoutResponse = await context.request.post(`${baseUrl}/api/v1/billing/checkout`, {
    data: { plan: "pro" },
    headers: bypassHeaders(),
  });
  if (checkoutResponse.status() !== 201) {
    throw new Error(`LIVE_BILLING_CHECKOUT_HTTP_${checkoutResponse.status()}`);
  }
  const checkoutBody = await checkoutResponse.json() as { data?: { checkoutUrl?: string; sessionId?: string } };
  const checkoutUrl = checkoutBody.data?.checkoutUrl;
  checkoutSessionId = checkoutBody.data?.sessionId ?? null;
  if (!checkoutUrl || new URL(checkoutUrl).hostname !== "checkout.stripe.com") {
    throw new Error("LIVE_BILLING_CHECKOUT_URL_INVALID");
  }

  customerId = (await sql<{ stripe_customer_id: string }[]>`
    select stripe_customer_id from billing_customers where organization_id = ${organizationId}
  `)[0]?.stripe_customer_id ?? null;
  if (!customerId) throw new Error("LIVE_BILLING_CUSTOMER_NOT_PERSISTED");

  const portalResponse = await context.request.post(`${baseUrl}/api/v1/billing/portal`, {
    headers: bypassHeaders(),
  });
  if (portalResponse.status() !== 201) {
    throw new Error(`LIVE_BILLING_PORTAL_HTTP_${portalResponse.status()}`);
  }
  const portalBody = await portalResponse.json() as { data?: { portalUrl?: string } };
  if (!portalBody.data?.portalUrl || !new URL(portalBody.data.portalUrl).hostname.endsWith("stripe.com")) {
    throw new Error("LIVE_BILLING_PORTAL_URL_INVALID");
  }

  const now = Math.floor(Date.now() / 1000);
  await postSignedStripeEvent(subscriptionEvent(eventIds.created, "customer.subscription.created", "active", proPrice, 1, now));
  if (await planForOrganization() !== "pro") throw new Error("LIVE_BILLING_PRO_ENTITLEMENT_FAILED");

  await postSignedStripeEvent(subscriptionEvent(eventIds.updated, "customer.subscription.updated", "active", teamPrice, 3, now + 60));
  if (await planForOrganization() !== "team") throw new Error("LIVE_BILLING_TEAM_ENTITLEMENT_FAILED");

  await postSignedStripeEvent(subscriptionEvent(eventIds.deleted, "customer.subscription.deleted", "canceled", teamPrice, 3, now + 120));
  if (await planForOrganization() !== "free") throw new Error("LIVE_BILLING_CANCELLATION_RECONCILIATION_FAILED");

  process.stdout.write(JSON.stringify({
    provider: "stripe",
    certified: true,
    mode: "test",
    baseOrigin,
    checkout: "PASS",
    portal: "PASS",
    signedWebhook: "PASS",
    proEntitlement: "PASS",
    teamEntitlement: "PASS",
    cancellationReconciliation: "PASS",
    charged: false,
  }, null, 2) + "\n");
} finally {
  await context.close();
  await browser.close();

  try {
    if (organizationId) {
      await sql.begin(async (tx) => {
        await tx`delete from subscriptions where stripe_subscription_id = ${subscriptionId}`;
        await tx`
          delete from usage_events
          where organization_id = ${organizationId}
            and source = 'stripe'
            and source_event_id in (${eventIds.created}, ${eventIds.updated}, ${eventIds.deleted})
        `;
        await tx`
          delete from audit_events
          where organization_id = ${organizationId}
            and (
              resource_id = ${subscriptionId}
              or (${checkoutSessionId}::text is not null and resource_id = ${checkoutSessionId})
            )
        `;
        if (originalPlan) await tx`update organizations set plan = ${originalPlan}, updated_at = now() where id = ${organizationId}`;
        if (!originalCustomerId && customerId) {
          await tx`delete from billing_customers where organization_id = ${organizationId} and stripe_customer_id = ${customerId}`;
        }
      });
    }
    if (!originalCustomerId && customerId) {
      await stripe.customers.del(customerId).catch(() => undefined);
    }
  } finally {
    await sql.end({ timeout: 3 });
  }
}
