import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organizations, providerConnections } from "@/db/schema";
import { AppPageHeader, StatusBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getConfigurationStatus, requiredConfiguration } from "@/lib/config";

export default async function SettingsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const configuration = getConfigurationStatus();
  const db = getDb();
  const [orgRows, providers] = await Promise.all([
    db.select({ retentionDays: organizations.retentionDays, contentRetentionEnabled: organizations.contentRetentionEnabled }).from(organizations).where(eq(organizations.id, tenant.organizationId)).limit(1),
    db.select({ provider: providerConnections.provider, label: providerConnections.label, status: providerConnections.status, lastVerifiedAt: providerConnections.lastVerifiedAt }).from(providerConnections).where(eq(providerConnections.organizationId, tenant.organizationId)),
  ]);
  const organization = orgRows[0];
  const services = (Object.entries(configuration) as Array<[keyof typeof configuration, string]>).map(([key, state]) => ({ key, state, required: requiredConfiguration(key) }));

  return <>
    <AppPageHeader kicker="Operations" title="Settings & connectivity" description="Live status comes from configuration and persisted provider state. This page does not turn missing credentials into green checks." />
    <div className="app-stack">
      <section className="app-panel"><div className="app-panel__header"><div><h2>Platform connectivity</h2><p>Non-secret deployment readiness for the core control plane.</p></div></div><div className="app-panel__body"><div className="integration-grid">{services.map((service) => <article className="integration-card" key={service.key}><div className="integration-card__top"><div><h3>{service.key}</h3><p>{service.state === "live" ? "Configured for this deployment." : service.state === "not_enabled" ? "Optional integration is not enabled." : `Needs: ${service.required.join(", ")}`}</p></div><StatusBadge status={service.state === "live" ? "active" : service.state} /></div></article>)}</div></div></section>

      <section className="app-panel"><div className="app-panel__header"><div><h2>AI provider status</h2><p>Only provider connections that passed a credential check are marked verified.</p></div></div><div className="app-panel__body">{providers.length ? <div className="integration-grid">{providers.map((provider) => <article className="integration-card" key={`${provider.provider}:${provider.label}`}><div className="integration-card__top"><div><h3>{provider.provider}</h3><p>{provider.label}{provider.lastVerifiedAt ? ` · checked ${new Date(provider.lastVerifiedAt).toLocaleString()}` : ""}</p></div><StatusBadge status={provider.status} /></div></article>)}</div> : <div className="empty-state"><div className="empty-state__icon">AI</div><h3>No verified providers</h3><p>Connect OpenAI, Claude, or Gemini from Integrations before the governed gateway can execute a provider request.</p></div>}</div></section>

      <section className="app-panel"><div className="app-panel__header"><div><h2>Privacy & retention</h2><p>Content retention is independent from usage-metadata retention.</p></div></div><div className="app-panel__body"><div className="config-list"><div className="config-row"><span>Telemetry retention</span><code>{organization?.retentionDays ?? 90} days</code></div><div className="config-row"><span>Prompt/code persistence</span><code>{organization?.contentRetentionEnabled ? "explicitly enabled" : "disabled by default"}</code></div><div className="config-row"><span>Gateway content</span><code>transit only by default</code></div><div className="config-row"><span>Provider credentials</span><code>AES-256-GCM encrypted</code></div></div></div></section>
    </div>
  </>;
}
