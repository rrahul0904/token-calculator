import Link from "next/link";
import { AppPageHeader, EmptyState, Money, StatusBadge } from "@/components/app-ui";
import { ProjectCreateForm } from "@/components/project-create-form";
import { getTenantContext } from "@/lib/auth/session";
import { getProjectsData } from "@/lib/app-data";

export default async function ProjectsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const projects = await getProjectsData(tenant.organizationId);

  return <>
    <AppPageHeader kicker="Attribution" title="Projects" description="Projects are the durable attribution boundary for runs, API keys, budgets, saved scenarios and integrations." />
    <div className="app-stack">
      {tenant.role === "owner" || tenant.role === "admin" ? <ProjectCreateForm /> : null}
      <section className="app-panel"><div className="app-panel__header"><div><h2>Project portfolio</h2><p>Spend is attributed from tagged run receipts rather than guessed later.</p></div></div>{projects.length === 0 ? <EmptyState title="No projects" body="Create your first project to isolate runs, keys and budgets." /> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Project</th><th>Status</th><th>Runs</th><th>Known spend</th><th>Description</th></tr></thead><tbody>{projects.map((project) => <tr key={project.id}><td><Link href={`/app/projects/${encodeURIComponent(project.id)}`}><strong>{project.name}</strong></Link><br /><small className="mono">{project.id}</small></td><td><StatusBadge status={project.archivedAt ? "archived" : "active"} /></td><td className="mono">{project.runCount}</td><td className="mono"><Money value={project.spend} /></td><td>{project.description ?? "—"}</td></tr>)}</tbody></table></div>}</section>
    </div>
  </>;
}
