import Link from "next/link";
import { AppPageHeader, StatusBadge } from "@/components/app-ui";
import { ProviderConnectionsManager } from "@/components/provider-connections-manager";
import { getTenantContext } from "@/lib/auth/session";
import { collectorCapabilities } from "@/lib/collectors/registry";
import { getConfigurationStatus } from "@/lib/config";

export default async function IntegrationsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const [collectors, config] = await Promise.all([collectorCapabilities(), Promise.resolve(getConfigurationStatus())]);

  const services = [
    { name: "PostgreSQL", state: config.database, body: "Durable tenant, billing, telemetry and policy state." },
    { name: "WorkOS", state: config.auth, body: "Authentication and enterprise identity path." },
    { name: "Stripe", state: config.stripe, body: "Subscription checkout, portal and entitlement synchronization." },
    { name: "BYOK vault", state: config.credentialVault, body: "AES-256-GCM encrypted provider credentials." },
    { name: "GitHub outcomes", state: config.github, body: "Commit, PR, CI and merge attribution path." },
    { name: "OpenTelemetry", state: config.otel, body: "Optional OTLP export of GenAI economics telemetry." },
    { name: "Distributed limiter", state: config.redis, body: "Only needed when gateway rate limits require cross-instance coordination." },
  ];

  return <>
    <AppPageHeader kicker="Collection + control" title="Integrations" description="Start with metadata-only local collectors, then add API/MCP instrumentation or a governed gateway when you need authoritative enforcement." actions={<Link className="button button--ghost" href="/developers">Developer setup</Link>} />
    <div className="app-stack">
      <ProviderConnectionsManager />

      <section className="app-panel"><div className="app-panel__header"><div><h2>Coding-agent collectors</h2><p>Precision is an explicit property of each integration.</p></div></div><div className="app-panel__body"><div className="integration-grid">{collectors.map((collector) => <article className="integration-card" key={collector.name}><div className="integration-card__top"><div><h3>{collector.name === "claude" ? "Claude Code" : collector.name === "antigravity" ? "Google Antigravity" : collector.name[0].toUpperCase() + collector.name.slice(1)}</h3><p>{collector.reason ?? "Local coding-agent telemetry collector."}</p></div><StatusBadge status={collector.available ? "available" : "unavailable"} /></div><div className="finding-list" style={{ marginTop: 12 }}><div className="finding"><p><strong>Tokens:</strong> {collector.measuredUsage ? "agent measured" : "estimated / unavailable"}</p><p><strong>Live watch:</strong> {collector.liveWatch ? "supported" : "not claimed"} · <strong>Historical sync:</strong> {collector.historicalSync ? "supported" : "not claimed"}</p></div></div></article>)}</div></div></section>

      <section className="app-panel"><div className="app-panel__header"><div><h2>Production services</h2><p>Missing credentials are configuration blockers, not simulated successes.</p></div></div><div className="app-panel__body"><div className="integration-grid">{services.map((service) => <article className="integration-card" key={service.name}><div className="integration-card__top"><div><h3>{service.name}</h3><p>{service.body}</p></div><StatusBadge status={service.state === "live" ? "live" : service.state === "not_enabled" ? "not enabled" : "configuration required"} /></div></article>)}</div></div></section>
    </div>
  </>;
}
