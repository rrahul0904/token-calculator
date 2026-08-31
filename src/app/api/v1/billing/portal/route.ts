import { eq } from "drizzle-orm";
import { billingCustomers } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getTenantContext } from "@/lib/auth/session";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe";

function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  if (!isDatabaseConfigured()) return response({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  if (!isStripeConfigured()) return response({ error: "STRIPE_NOT_CONFIGURED", state: "code_complete_configuration_blocked" }, 503);
  const tenant = await getTenantContext();
  if (!tenant) return response({ error: "UNAUTHENTICATED_OR_NOT_ONBOARDED" }, 401);
  if (tenant.role !== "owner" && tenant.role !== "admin") return response({ error: "FORBIDDEN" }, 403);
  const db = getDb();
  const customer = (await db.select().from(billingCustomers).where(eq(billingCustomers.organizationId, tenant.organizationId)).limit(1))[0];
  if (!customer) return response({ error: "BILLING_CUSTOMER_NOT_FOUND" }, 404);
  const session = await getStripe().billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/app/billing`,
  });
  return response({ data: { portalUrl: session.url } }, 201);
}
