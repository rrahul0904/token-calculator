import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organizations, providerConnections } from "@/db/schema";
import { AppPageHeader, StatusBadge } from "@/components/app-ui";
import { RetentionSettings } from "@/components/retention-settings";
import { getTenantContext } from "@/lib/auth/session";
import { getConfigurationStatus, requiredConfiguration } from "@/lib/config";
import { getEnterpriseIdentityStatus } from "@/lib/enterprise/workos-status";

export default async function SettingsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const configuration = getConfigurationStatus();
  const db = getDb();
  const [orgRows, providers] = await Promise.all([
    db.select({ workosOrganizationId: organizations.workosOrganizationId, retentionDays: organizations.retentionDays, contentRetentionEnabled: organizations.contentRetentionEnabled }).from(organizations).where(eq(organizations.id, tenant.organizationId)).limit(1),
    db.select({ provider: providerConnections.provider, label: providerConnections.label, status: providerConnections.status, lastVerifiedAt: providerConnections.lastVerifiedAt }).from(providerConnections).where(eq(providerConnections.organizationId, tenant.organizationId)),
  ]);
  const organization = orgRows[0];
  const identity = await getEnterpriseIdentityStatus(organization?.workosOrganizationId ?? null);
  const services = (Object.entries(configuration) as Array<[keyof typeof configuration, string]>).map(([key, state]) => ({ key, state, required: requiredConfiguration(key) }));
  const canManage = tenant.role === "owner" || tenant.role === "admin";

  return <>
    <AppPageHeader kicker="Operations" title="Settings & connectivity" description="Live status comes from deployment configuration, provider verification, and WorkOS organization state. Missing credentials are never turned into green checks." />
    <div className="app-stack">
      <section className="app-panel"><div className="app-panel__header"><div><h2>Platform connectivity</h2><p>Non-secret deployment readiness for the core control plane.</p></div></div><div className="app-panel__body"><div className="integration-grid">{services.map((service) => <article className="integration-card" key={service.key}><div className="integration-card__top"><div><h3>{service.key}</h3><p>{service.state === "live" ? "Configured for this deployment." : service.state === "not_enabled" ? "Optional integration is not enabled." : `Needs: ${service.required.join(", ")}`}</p></div><StatusBadge status={service.state === "live" ? "active" : service.state} /></div></article>)}</div></div></section>

      <section className="app-panel"><div className="app-panel__header"><div><h2>Enterprise identity</h2><p>Connections are read directly from the WorkOS organization. Customer IdP/directory setup still occurs through the WorkOS enterprise onboarding flow.</p></div></div><div className="app-panel__body">{identity.error ? <div className="empty-state"><div className="empty-state__icon">!</div><h3>WorkOS status unavailable</h3><p>{identity.error}</p></div> : <div className="integration-grid"><article className="integration-card"><div className="integration-card__top"><div><h3>Single Sign-On</h3><p>{identity.sso.length ? `${identity.sso.length} connection${identity.sso.length === 1 ? "" : "s"}` : identity.configured ? "No SAML/OIDC connection configured for this organization." : "WorkOS organization is not configured."}</p></div><StatusBadge status={identity.sso.some((item) => item.state === "active") ? "active" : "not_configured"} /></div>{identity.sso.map((connection) => <p key={connection.id}>{connection.name} · {connection.type} · {connection.state}{connection.domains.length ? ` · ${connection.domains.join(", ")}` : ""}</p>)}</article><article className="integration-card"><div className="integration-card__top"><div><h3>Directory Sync / SCIM</h3><p>{identity.directories.length ? `${identity.directories.length} director${identity.directories.length === 1 ? "y" : "ies"}` : identity.configured ? "No directory connection configured for this organization." : "WorkOS organization is not configured."}</p></div><StatusBadge status={identity.directories.some((item) => item.state === "linked") ? "active" : "not_configured"} /></div>{identity.directories.map((directory) => <p key={directory.id}>{directory.name} · {directory.type} · {directory.state}{directory.domain ? ` · ${directory.domain}` : ""}</p>)}</article></div>}</div></section>

      <section className="app-panel"><div className="app-panel__header"><div><h2>AI provider status</h2><p>Only provider connections that passed a credential check are marked verified.</p></div></div><div className="app-panel__body">{providers.length ? <div className="integration-grid">{providers.map((provider) => <article className="integration-card" key={`${provider.provider}:${provider.label}`}><div className="integration-card__top"><div><h3>{provider.provider}</h3><p>{provider.label}{provider.lastVerifiedAt ? ` · checked ${new Date(provider.lastVerifiedAt).toLocaleString()}` : ""}</p></div><StatusBadge status={provider.status} /></div></article>)}</div> : <div className="empty-state"><div className="empty-state__icon">AI</div><h3>No verified providers</h3><p>Connect OpenAI, Claude, or Gemini from Integrations before the governed gateway can execute a provider request.</p></div>}</div></section>

      <RetentionSettings canManage={canManage} />

      <section className="app-panel"><div className="app-panel__header"><div><h2>Privacy posture</h2><p>Content retention is independent from usage-metadata retention.</p></div></div><div className="app-panel__body"><div className="config-list"><div className="config-row"><span>Legacy telemetry default</span><code>{organization?.retentionDays ?? 90} days</code></div><div className="config-row"><span>Prompt/code persistence</span><code>{organization?.contentRetentionEnabled ? "explicitly enabled" : "disabled by default"}</code></div><div className="config-row"><span>Gateway content</span><code>transit only by default</code></div><div className="config-row"><span>Provider credentials</span><code>AES-256-GCM + tenant/provider/credential/version AAD</code></div></div></div></section>
    </div>
  </>;
}
