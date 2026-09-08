import process from "node:process";
import Stripe from "stripe";

type State = "PASS" | "FAIL" | "BLOCKED_EXTERNAL";

const requiredEvents = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const;

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function normalizeUrl(value: string) {
  return value.replace(/\/$/, "");
}

const secret = process.env.STRIPE_SECRET_KEY;
const webhookSecretPresent = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
const proPriceId = process.env.STRIPE_PRICE_PRO;
const teamPriceId = process.env.STRIPE_PRICE_TEAM;
const strict = process.argv.includes("--require");
const expectedMode = argument("mode");
const baseUrl = argument("base-url");
const expectedWebhookUrl = baseUrl ? `${normalizeUrl(baseUrl)}/api/webhooks/stripe` : null;

if (!secret || !proPriceId || !teamPriceId || !webhookSecretPresent) {
  process.stdout.write(JSON.stringify({
    provider: "stripe",
    state: "BLOCKED_EXTERNAL" as State,
    ready: false,
    mode: "unknown",
    variables: {
      secretKey: Boolean(secret),
      webhookSecret: webhookSecretPresent,
      proPrice: Boolean(proPriceId),
      teamPrice: Boolean(teamPriceId),
    },
    blockers: ["STRIPE_RUNTIME_CONFIGURATION_MISSING"],
  }, null, 2) + "\n");
  if (strict) process.exitCode = 2;
} else {
  try {
    const stripe = new Stripe(secret, {
      appInfo: { name: "Token Intelligence release verifier", version: "0.3.0" },
    });
    const [pro, team, webhookPage] = await Promise.all([
      stripe.prices.retrieve(proPriceId),
      stripe.prices.retrieve(teamPriceId),
      stripe.webhookEndpoints.list({ limit: 100 }),
    ]);

    const liveCredential = secret.includes("_live_");
    const actualMode = pro.livemode ? "live" : "test";
    const checks = {
      proActive: pro.active,
      proAmount: pro.unit_amount === 1500,
      proCurrency: pro.currency === "usd",
      proMonthly: pro.type === "recurring" && pro.recurring?.interval === "month" && pro.recurring.interval_count === 1,
      teamActive: team.active,
      teamAmount: team.unit_amount === 2900,
      teamCurrency: team.currency === "usd",
      teamMonthly: team.type === "recurring" && team.recurring?.interval === "month" && team.recurring.interval_count === 1,
      sameMode: pro.livemode === team.livemode && (liveCredential ? pro.livemode : !pro.livemode),
      expectedMode: !expectedMode || actualMode === expectedMode,
    };

    const candidate = webhookPage.data.find((endpoint) => {
      const events = new Set(endpoint.enabled_events);
      const urlMatches = !expectedWebhookUrl || normalizeUrl(endpoint.url) === expectedWebhookUrl;
      return endpoint.status === "enabled" && urlMatches && requiredEvents.every((event) => events.has(event) || events.has("*"));
    });
    const webhook = {
      configured: Boolean(candidate),
      endpointId: candidate?.id ?? null,
      status: candidate?.status ?? null,
      requiredEvents: [...requiredEvents],
      expectedUrl: expectedWebhookUrl,
      actualUrl: candidate?.url ?? null,
      missingEvents: candidate
        ? requiredEvents.filter((event) => !(candidate.enabled_events.includes(event) || candidate.enabled_events.includes("*")))
        : [...requiredEvents],
    };

    const state: State = Object.values(checks).every(Boolean) && webhook.configured ? "PASS" : "FAIL";
    process.stdout.write(JSON.stringify({
      provider: "stripe",
      state,
      ready: state === "PASS",
      mode: actualMode,
      prices: {
        pro: { id: pro.id, amount: pro.unit_amount, currency: pro.currency, interval: pro.recurring?.interval ?? null },
        team: { id: team.id, amount: team.unit_amount, currency: team.currency, interval: team.recurring?.interval ?? null },
      },
      checks,
      webhook,
    }, null, 2) + "\n");
    if (state !== "PASS") process.exitCode = 2;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      provider: "stripe",
      state: "FAIL",
      ready: false,
      error: error instanceof Error ? error.name : "STRIPE_VERIFY_FAILED",
    }, null, 2) + "\n");
    process.exitCode = 2;
  }
}
