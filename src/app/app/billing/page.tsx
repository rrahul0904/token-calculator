import { desc, eq } from "drizzle-orm";
import { AppPageHeader, StatusBadge } from "@/components/app-ui";
import { BillingActions } from "@/components/billing-actions";
import { getTenantContext } from "@/lib/auth/session";
import { getDb } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { PLAN_ENTITLEMENTS } from "@/lib/billing/entitlements";
import { getConfigurationStatus } from "@/lib/config";

export default async function BillingPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const subscription = (await getDb().select().from(subscriptions).where(eq(subscriptions.organizationId, tenant.organizationId)).orderBy(desc(subscriptions.updatedAt)).limit(1))[0] ?? null;
  const entitlement = PLAN_ENTITLEMENTS[tenant.plan];
  const config = getConfigurationStatus();
  const capabilities = Object.entries(entitlement.capabilities).filter(([, value]) => value).map(([key]) => key.replaceAll("_", " "));

  return <>
    <AppPageHeader kicker="Subscription" title="Billing" description="Paid features are unlocked from server-side Stripe state. The browser never grants itself a plan." />
    <div className="app-grid">
      <section className="app-panel"><div className="app-panel__header"><div><h2>Current plan</h2><p>Subscription status is synchronized from signed Stripe webhook events.</p></div><span className="plan-badge">{tenant.plan.toUpperCase()}</span></div><div className="app-panel__body app-stack"><div className="finding"><div className="finding__top"><h3>{tenant.organizationName}</h3><StatusBadge status={subscription?.status ?? (tenant.plan === "free" ? "free" : "unverified")} /></div><p>{subscription ? `${subscription.seats} seat${subscription.seats === 1 ? "" : "s"} · ${subscription.cancelAtPeriodEnd ? "cancels at period end" : "renews unless changed"}` : "No active Stripe subscription record. Free access remains available."}</p>{subscription?.currentPeriodEnd && <p>Current period ends {subscription.currentPeriodEnd.toLocaleDateString()}.</p>}</div><BillingActions stripeLive={config.stripe === "live"} plan={tenant.plan} /></div></section>
      <section className="app-panel"><div className="app-panel__header"><div><h2>Entitlements</h2><p>Resolved on the server from plan and authorized overrides.</p></div></div><div className="app-panel__body"><div className="finding-list"><div className="finding"><h3>Limits</h3><p>Projects: {entitlement.projects ?? "custom"} · API keys: {entitlement.apiKeys ?? "custom"} · Telemetry events/month: {entitlement.telemetryEventsPerMonth?.toLocaleString() ?? "custom"}</p></div><div className="finding"><h3>Capabilities</h3><p>{capabilities.length ? capabilities.join(" · ") : "Public calculator and basic saved scenarios"}</p></div></div></div></section>
    </div>
  </>;
}
