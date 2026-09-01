import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { AppPageHeader, EmptyState } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";

export default async function AuditPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    return <><AppPageHeader kicker="Security" title="Audit log" description="Organization audit events are restricted to owners and administrators." /><EmptyState title="Administrator access required" body="Your current role cannot read organization-wide security and administration events." mark="RBAC" /></>;
  }
  const rows = await getDb().select().from(auditEvents).where(eq(auditEvents.organizationId, tenant.organizationId)).orderBy(desc(auditEvents.occurredAt)).limit(200);

  return <>
    <AppPageHeader kicker="Security + SIEM" title="Audit log" description="Append-only administrative and security events with a metadata-only NDJSON export for downstream SIEM ingestion." actions={<a className="button button--ghost" href="/api/v1/audit?format=ndjson&limit=500">Export NDJSON</a>} />
    <section className="app-panel"><div className="app-panel__header"><div><h2>Recent events</h2><p>Secrets, prompt text and code are not included in audit event details.</p></div></div>{rows.length === 0 ? <EmptyState title="No audit events" body="Administrative actions, key changes, billing events and integration changes will appear here." mark="AUD" /> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.occurredAt.toLocaleString()}</td><td><span>{row.actorType}</span><br /><small className="mono">{row.actorId ?? "system"}</small></td><td className="mono">{row.action}</td><td><span>{row.resourceType}</span><br /><small className="mono">{row.resourceId ?? "—"}</small></td><td><small className="mono">{JSON.stringify(row.details).slice(0, 240)}</small></td></tr>)}</tbody></table></div>}</section>
  </>;
}
