import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auditEvents, billingCustomers, organizations, subscriptions, usageEvents } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getStripe, isStripeConfigured, isSubscriptionEntitled, planFromStripePrice } from "@/lib/billing/stripe";

export const runtime = "nodejs";

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

function metadataOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || !("metadata" in value)) return {};
  const metadata = (value as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") return {};
  return Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

async function resolveOrganizationId(object: unknown): Promise<string | null> {
  const metadata = metadataOf(object);
  if (metadata.organization_id) return metadata.organization_id;
  const customer = object && typeof object === "object" && "customer" in object ? idOf((object as { customer?: unknown }).customer) : null;
  if (!customer) return null;
  const db = getDb();
  return (await db.select({ organizationId: billingCustomers.organizationId }).from(billingCustomers).where(eq(billingCustomers.stripeCustomerId, customer)).limit(1))[0]?.organizationId ?? null;
}

function subscriptionSnapshot(object: unknown) {
  const value = object as {
    id?: string;
    customer?: unknown;
    status?: string;
    cancel_at_period_end?: boolean;
    current_period_end?: number;
    items?: { data?: Array<{ quantity?: number | null; current_period_end?: number; price?: { id?: string } }> };
    metadata?: Record<string, string>;
  };
  const firstItem = value.items?.data?.[0];
  return {
    id: value.id ?? null,
    status: value.status ?? "unknown",
    priceId: firstItem?.price?.id ?? null,
    seats: firstItem?.quantity ?? 1,
    currentPeriodEnd: value.current_period_end ?? firstItem?.current_period_end ?? null,
    cancelAtPeriodEnd: value.cancel_at_period_end ?? false,
  };
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return Response.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  if (!isStripeConfigured()) return Response.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) return Response.json({ error: "MISSING_SIGNATURE" }, { status: 400 });

  const payload = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  const object = event.data.object;
  const organizationId = await resolveOrganizationId(object);
  if (!organizationId) {
    return Response.json({ received: true, processed: false, reason: "ORGANIZATION_NOT_RESOLVED" }, { status: 202 });
  }

  const db = getDb();
  const inserted = await db.insert(usageEvents).values({
    id: `wh_${randomUUID()}`,
    organizationId,
    sourceEventId: event.id,
    source: "stripe",
    eventType: event.type,
    occurredAt: new Date(event.created * 1000),
    payload: {
      stripeObjectId: idOf(object),
      eventType: event.type,
      livemode: event.livemode,
    },
  }).onConflictDoNothing().returning({ id: usageEvents.id });
  if (inserted.length === 0) return Response.json({ received: true, duplicate: true });

  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const snapshot = subscriptionSnapshot(object);
    if (snapshot.id) {
      const plan = planFromStripePrice(snapshot.priceId);
      await db.transaction(async (tx) => {
        await tx.insert(subscriptions).values({
          id: `sub_${randomUUID()}`,
          organizationId,
          stripeSubscriptionId: snapshot.id!,
          stripePriceId: snapshot.priceId,
          plan,
          status: snapshot.status,
          seats: snapshot.seats,
          currentPeriodEnd: snapshot.currentPeriodEnd ? new Date(snapshot.currentPeriodEnd * 1000) : null,
          cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        }).onConflictDoUpdate({
          target: subscriptions.stripeSubscriptionId,
          set: {
            stripePriceId: snapshot.priceId,
            plan,
            status: snapshot.status,
            seats: snapshot.seats,
            currentPeriodEnd: snapshot.currentPeriodEnd ? new Date(snapshot.currentPeriodEnd * 1000) : null,
            cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
            updatedAt: new Date(),
          },
        });
        await tx.update(organizations).set({
          plan: isSubscriptionEntitled(snapshot.status) ? plan : "free",
          updatedAt: new Date(),
        }).where(eq(organizations.id, organizationId));
        await tx.insert(auditEvents).values({
          id: `aud_${randomUUID()}`,
          organizationId,
          actorType: "system",
          actorId: "stripe",
          action: "billing.subscription_synced",
          resourceType: "subscription",
          resourceId: snapshot.id,
          details: { status: snapshot.status, plan, seats: snapshot.seats, eventType: event.type },
        });
      });
    }
  }

  if (event.type === "invoice.payment_failed") {
    await db.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId,
      actorType: "system",
      actorId: "stripe",
      action: "billing.invoice_payment_failed",
      resourceType: "invoice",
      resourceId: idOf(object),
      details: { eventId: event.id },
    });
  }

  return Response.json({ received: true, processed: true });
}
