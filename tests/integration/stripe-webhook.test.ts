import process from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { getStripe } from "@/lib/billing/stripe";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";

const integrationEnabled = process.env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("Stripe signed subscription lifecycle", () => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: process.env.DATABASE_SSL === "disable" ? false : "require" });
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const organizationId = `stripe_org_${suffix}`;
  const subscriptionId = `sub_test_${suffix}`;
  const customerId = `cus_test_${suffix}`;
  const proPrice = `price_test_pro_${suffix}`;
  const teamPrice = `price_test_team_${suffix}`;
  const webhookSecret = `whsec_test_${suffix}`;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_token_intelligence_ci_only";
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    process.env.STRIPE_PRICE_PRO = proPrice;
    process.env.STRIPE_PRICE_TEAM = teamPrice;
    await sql`insert into organizations (id, name, slug, plan) values (${organizationId}, 'Stripe E2E Org', ${`stripe-e2e-${suffix}`}, 'free')`;
    await sql`insert into billing_customers (id, organization_id, stripe_customer_id) values (${`bc_${suffix}`}, ${organizationId}, ${customerId})`;
  });

  afterAll(async () => {
    await closeDb();
    await sql`delete from organizations where id = ${organizationId}`;
    await sql.end({ timeout: 3 });
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_PRO;
    delete process.env.STRIPE_PRICE_TEAM;
  });

  function signedRequest(event: Record<string, unknown>) {
    const payload = JSON.stringify(event);
    const signature = getStripe().webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    return new Request("http://127.0.0.1/api/webhooks/stripe", {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json", "stripe-signature": signature },
    });
  }

  function subscriptionEvent(args: { id: string; type: string; status: string; priceId: string; seats?: number; cancelAtPeriodEnd?: boolean }) {
    return {
      id: args.id,
      object: "event",
      type: args.type,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: {
        object: {
          id: subscriptionId,
          object: "subscription",
          customer: customerId,
          status: args.status,
          cancel_at_period_end: args.cancelAtPeriodEnd ?? false,
          metadata: { organization_id: organizationId },
          items: { data: [{ quantity: args.seats ?? 1, current_period_end: Math.floor(Date.now() / 1000) + 86400, price: { id: args.priceId } }] },
        },
      },
    };
  }

  it("rejects an invalid Stripe signature before mutating state", async () => {
    const response = await stripeWebhook(new Request("http://127.0.0.1/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify(subscriptionEvent({ id: `evt_bad_${suffix}`, type: "customer.subscription.created", status: "active", priceId: proPrice })),
      headers: { "stripe-signature": "t=1,v1=invalid" },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_SIGNATURE" });
    const org = await sql<{ plan: string }[]>`select plan from organizations where id = ${organizationId}`;
    expect(org[0]?.plan).toBe("free");
  });

  it("activates Pro and ignores duplicate webhook delivery", async () => {
    const eventId = `evt_pro_${suffix}`;
    const event = subscriptionEvent({ id: eventId, type: "customer.subscription.created", status: "active", priceId: proPrice });
    const first = await stripeWebhook(signedRequest(event));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ received: true, processed: true });

    const duplicate = await stripeWebhook(signedRequest(event));
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ received: true, duplicate: true });

    const org = await sql<{ plan: string }[]>`select plan from organizations where id = ${organizationId}`;
    expect(org[0]?.plan).toBe("pro");
    const subs = await sql<{ plan: string; status: string; seats: number }[]>`select plan, status, seats from subscriptions where stripe_subscription_id = ${subscriptionId}`;
    expect(subs).toEqual([{ plan: "pro", status: "active", seats: 1 }]);
    const deliveries = await sql<{ count: number }[]>`select count(*)::int as count from usage_events where organization_id = ${organizationId} and source = 'stripe' and source_event_id = ${eventId}`;
    expect(deliveries[0]?.count).toBe(1);
  });

  it("updates Team seat quantity and entitlement", async () => {
    const response = await stripeWebhook(signedRequest(subscriptionEvent({
      id: `evt_team_${suffix}`,
      type: "customer.subscription.updated",
      status: "active",
      priceId: teamPrice,
      seats: 7,
    })));
    expect(response.status).toBe(200);
    const org = await sql<{ plan: string }[]>`select plan from organizations where id = ${organizationId}`;
    expect(org[0]?.plan).toBe("team");
    const subs = await sql<{ plan: string; seats: number }[]>`select plan, seats from subscriptions where stripe_subscription_id = ${subscriptionId}`;
    expect(subs).toEqual([{ plan: "team", seats: 7 }]);
  });

  it("removes entitlement when the subscription is deleted", async () => {
    const response = await stripeWebhook(signedRequest(subscriptionEvent({
      id: `evt_deleted_${suffix}`,
      type: "customer.subscription.deleted",
      status: "canceled",
      priceId: teamPrice,
      seats: 7,
    })));
    expect(response.status).toBe(200);
    const org = await sql<{ plan: string }[]>`select plan from organizations where id = ${organizationId}`;
    expect(org[0]?.plan).toBe("free");
    const subs = await sql<{ status: string }[]>`select status from subscriptions where stripe_subscription_id = ${subscriptionId}`;
    expect(subs).toEqual([{ status: "canceled" }]);
  });

  it("records failed invoice audit evidence without changing tenant identity", async () => {
    const eventId = `evt_invoice_failed_${suffix}`;
    const event = {
      id: eventId,
      object: "event",
      type: "invoice.payment_failed",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: { id: `in_${suffix}`, object: "invoice", customer: customerId, metadata: { organization_id: organizationId } } },
    };
    const response = await stripeWebhook(signedRequest(event));
    expect(response.status).toBe(200);
    const audits = await sql<{ action: string }[]>`select action from audit_events where organization_id = ${organizationId} and action = 'billing.invoice_payment_failed'`;
    expect(audits).toEqual([{ action: "billing.invoice_payment_failed" }]);
  });
});
