import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { auditEvents, billingCustomers } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getTenantContext } from "@/lib/auth/session";
import { getStripe, isStripeConfigured, stripePriceForPlan } from "@/lib/billing/stripe";

const schema = z.object({
  plan: z.enum(["pro", "team"]),
  seats: z.number().int().min(1).max(500).optional(),
});

function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function billingReturnOrigin(request: Request): string {
  if (process.env.VERCEL_ENV === "preview") return new URL(request.url).origin;
  return process.env.APP_BASE_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return response({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  if (!isStripeConfigured()) return response({ error: "STRIPE_NOT_CONFIGURED", state: "code_complete_configuration_blocked" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return response({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  if (tenant.role !== "owner" && tenant.role !== "admin") return response({ error: "FORBIDDEN" }, 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  if (parsed.data.plan === "pro" && (parsed.data.seats ?? 1) !== 1) return response({ error: "PRO_IS_SINGLE_SEAT" }, 400);

  const priceId = stripePriceForPlan(parsed.data.plan);
  if (!priceId) return response({ error: "STRIPE_PRICE_NOT_CONFIGURED" }, 503);
  const stripe = getStripe();
  const db = getDb();
  let customer = (await db.select().from(billingCustomers).where(eq(billingCustomers.organizationId, tenant.organizationId)).limit(1))[0];
  if (!customer) {
    const created = await stripe.customers.create({
      email: tenant.email,
      name: tenant.organizationName,
      metadata: { organization_id: tenant.organizationId },
    }, { idempotencyKey: `customer:${tenant.organizationId}` });
    customer = (await db.insert(billingCustomers).values({
      id: `bc_${randomUUID()}`,
      organizationId: tenant.organizationId,
      stripeCustomerId: created.id,
    }).returning())[0];
  }

  const baseUrl = billingReturnOrigin(request);
  const quantity = parsed.data.plan === "team" ? parsed.data.seats ?? 1 : 1;
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.stripeCustomerId,
    client_reference_id: tenant.organizationId,
    line_items: [{ price: priceId, quantity }],
    success_url: `${baseUrl}/app/billing?checkout=success`,
    cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
    allow_promotion_codes: true,
    metadata: { organization_id: tenant.organizationId, plan: parsed.data.plan },
    subscription_data: { metadata: { organization_id: tenant.organizationId, plan: parsed.data.plan } },
  }, { idempotencyKey: request.headers.get("idempotency-key") ?? `checkout:${tenant.organizationId}:${parsed.data.plan}:${Date.now()}` });

  await db.insert(auditEvents).values({
    id: `aud_${randomUUID()}`,
    organizationId: tenant.organizationId,
    actorType: "user",
    actorId: tenant.internalUserId,
    action: "billing.checkout_created",
    resourceType: "stripe_checkout_session",
    resourceId: checkout.id,
    details: { plan: parsed.data.plan, seats: quantity },
  });
  return response({ data: { checkoutUrl: checkout.url, sessionId: checkout.id } }, 201);
}
