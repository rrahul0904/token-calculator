import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { apiKeys, budgets, projects, runs } from "@/db/schema";
import { AppPageHeader, EmptyState, Money, StatusBadge } from "@/components/app-ui";
import { ProjectSettingsForm } from "@/components/project-settings-form";
import { getTenantContext } from "@/lib/auth/session";

function numberOrNull(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function runCost(run: { reconciledCostUsd: string | null; actualCostUsd: string | null; estimatedCostUsd: string | null }) {
  return numberOrNull(run.reconciledCostUsd) ?? numberOrNull(run.actualCostUsd) ?? numberOrNull(run.estimatedCostUsd);
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const { projectId } = await params;
  const db = getDb();
  const project = (await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.organizationId, tenant.organizationId))).limit(1))[0];
  if (!project) notFound();

  const [runRows, keyRows, budgetRows] = await Promise.all([
    db.select().from(runs).where(and(eq(runs.organizationId, tenant.organizationId), eq(runs.projectId, projectId))).orderBy(desc(runs.startedAt)).limit(25),
    db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastFour: apiKeys.lastFour, revokedAt: apiKeys.revokedAt, scopes: apiKeys.scopes }).from(apiKeys).where(and(eq(apiKeys.organizationId, tenant.organizationId), eq(apiKeys.projectId, projectId))),
    db.select().from(budgets).where(and(eq(budgets.organizationId, tenant.organizationId), eq(budgets.scopeType, "project"), eq(budgets.scopeId, projectId))),
  ]);
  const costs = runRows.flatMap((run) => {
    const cost = runCost(run);
    return cost === null ? [] : [cost];
  });
  const spend = costs.length ? costs.reduce((sum, value) => sum + value, 0) : null;
  const canManage = tenant.role === "owner" || tenant.role === "admin";

  return <>
    <AppPageHeader kicker="Project" title={project.name} description={project.description ?? "Project-scoped attribution, credentials, budgets and agent runs."} actions={<Link className="button button--ghost" href="/app/projects">All projects</Link>} />
    <div className="metric-grid">
      <div className="metric-card"><span>Status</span><strong>{project.archivedAt ? "Archived" : "Active"}</strong><small className="mono">{project.id}</small></div>
      <div className="metric-card"><span>Recent runs</span><strong>{runRows.length}</strong><small>latest 25 loaded</small></div>
      <div className="metric-card"><span>Known spend</span><strong><Money value={spend} /></strong><small>from loaded run receipts</small></div>
      <div className="metric-card"><span>Project budgets</span><strong>{budgetRows.length}</strong><small>{keyRows.filter((key) => !key.revokedAt).length} active scoped keys</small></div>
    </div>

    <div className="app-stack">
      {canManage ? <ProjectSettingsForm project={{ id: project.id, name: project.name, description: project.description, archivedAt: project.archivedAt }} /> : null}

      <section className="app-panel"><div className="app-panel__header"><div><h2>Project API keys</h2><p>Keys listed here cannot be used outside this project.</p></div><Link className="button button--ghost" href="/app/api-keys">Manage keys</Link></div>{keyRows.length === 0 ? <EmptyState title="No project-scoped keys" body="Create an API key and bind it to this project from the API Keys workspace." /> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Status</th></tr></thead><tbody>{keyRows.map((key) => <tr key={key.id}><td>{key.name}</td><td className="mono">{key.prefix}…{key.lastFour}</td><td><small>{key.scopes.join(", ")}</small></td><td><StatusBadge status={key.revokedAt ? "revoked" : "active"} /></td></tr>)}</tbody></table></div>}</section>

      <section className="app-panel"><div className="app-panel__header"><div><h2>Project budgets</h2><p>Hard-stop budgets and policy limits are evaluated before governed provider calls.</p></div><Link className="button button--ghost" href="/app/budgets">Manage budgets</Link></div>{budgetRows.length === 0 ? <EmptyState title="No project budgets" body="Create a project-scoped budget to make cost limits enforceable at the gateway." /> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Name</th><th>Period</th><th>USD limit</th><th>Token limit</th><th>Hard stop</th><th>Status</th></tr></thead><tbody>{budgetRows.map((budget) => <tr key={budget.id}><td>{budget.name}</td><td>{budget.period}</td><td className="mono">{budget.limitUsd ?? "—"}</td><td className="mono">{budget.tokenLimit ?? "—"}</td><td>{budget.hardStop ? "Yes" : "No"}</td><td><StatusBadge status={budget.enabled ? "active" : "disabled"} /></td></tr>)}</tbody></table></div>}</section>

      <section className="app-panel"><div className="app-panel__header"><div><h2>Recent runs</h2><p>Only runs belonging to this project and organization are queried.</p></div></div>{runRows.length === 0 ? <EmptyState title="No runs yet" body="Instrument an agent or invoke the governed gateway with this project ID." /> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Run</th><th>Agent</th><th>Status</th><th>Usage source</th><th>Cost</th><th>Started</th></tr></thead><tbody>{runRows.map((run) => <tr key={run.id}><td><Link href={`/app/runs/${encodeURIComponent(run.id)}`} className="mono">{run.id}</Link></td><td>{run.agentName}</td><td><StatusBadge status={run.status} /></td><td>{run.usageSource}</td><td className="mono"><Money value={runCost(run)} /></td><td>{run.startedAt.toLocaleString()}</td></tr>)}</tbody></table></div>}</section>
    </div>
  </>;
}
