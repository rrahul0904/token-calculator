import { eq } from "drizzle-orm";
import { AppPageHeader, EmptyState, StatusBadge } from "@/components/app-ui";
import { BudgetManager } from "@/components/budget-manager";
import { getTenantContext, roleCan } from "@/lib/auth/session";
import { getDb } from "@/db/client";
import { budgets, policies } from "@/db/schema";

export default async function BudgetsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const [budgetRows, policyRows] = await Promise.all([
    getDb().select().from(budgets).where(eq(budgets.organizationId, tenant.organizationId)),
    getDb().select().from(policies).where(eq(policies.organizationId, tenant.organizationId)),
  ]);
  const canManage = roleCan(tenant.role, "policy:manage");

  return <>
    <AppPageHeader kicker="Control" title="Budgets & Alerts" description="Budgets make spend visible; policies decide whether the next model/tool/fallback operation should be allowed, warned, approved, blocked or killed." />
    <div className="app-grid">
      <div className="app-stack">
        <section className="app-panel"><div className="app-panel__header"><div><h2>Budgets</h2><p>Organization, project, run and other scoped limits.</p></div></div>{budgetRows.length === 0 ? <EmptyState title="No budgets configured" body="Create a run, daily or monthly guardrail. Gateway traffic can enforce hard stops; advisory integrations can surface warnings." /> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Name</th><th>Scope</th><th>Period</th><th>USD</th><th>Tokens</th><th>Warn</th><th>Enforcement</th><th>Status</th></tr></thead><tbody>{budgetRows.map((budget) => <tr key={budget.id}><td>{budget.name}</td><td>{budget.scopeType}{budget.scopeId ? ` · ${budget.scopeId}` : ""}</td><td>{budget.period}</td><td className="mono">{budget.limitUsd ? `$${Number(budget.limitUsd).toFixed(2)}` : "—"}</td><td className="mono">{budget.tokenLimit?.toLocaleString() ?? "—"}</td><td className="mono">{Number(budget.warnAtPct).toFixed(0)}%</td><td>{budget.hardStop ? "Hard stop" : "Warn"}</td><td><StatusBadge status={budget.enabled ? "active" : "disabled"} /></td></tr>)}</tbody></table></div>}</section>
        <section className="app-panel"><div className="app-panel__header"><div><h2>Policies</h2><p>Restrictive composition keeps hard caps and allowlists deterministic.</p></div></div>{policyRows.length === 0 ? <EmptyState title="No policies configured" body="Policies can cap turns/retries/tool calls, restrict providers/models, disable fallback, or require approval for expensive escalation." /> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Name</th><th>Scope</th><th>Priority</th><th>Rules</th><th>Status</th></tr></thead><tbody>{policyRows.map((policy) => <tr key={policy.id}><td>{policy.name}</td><td>{policy.scopeType}</td><td>{policy.priority}</td><td className="mono">{JSON.stringify(policy.rules)}</td><td><StatusBadge status={policy.enabled ? "active" : "disabled"} /></td></tr>)}</tbody></table></div>}</section>
      </div>
      <section className="app-panel"><div className="app-panel__header"><div><h2>Create budget</h2><p>New limits are persisted and audited.</p></div></div><div className="app-panel__body">{canManage ? <BudgetManager /> : <EmptyState mark="—" title="Read-only access" body="Your organization role can view budgets but cannot change control-plane policy." />}</div></section>
    </div>
  </>;
}
