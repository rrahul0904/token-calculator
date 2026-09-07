import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organizationMembers, projects, users } from "@/db/schema";
import { AppPageHeader } from "@/components/app-ui";
import { MemberManager } from "@/components/member-manager";
import { ServiceAccountsManager } from "@/components/service-accounts-manager";
import { TeamsManager } from "@/components/teams-manager";
import { getTenantContext, roleCan } from "@/lib/auth/session";

export default async function TeamPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const [members, projectRows] = await Promise.all([
    getDb()
      .select({ id: organizationMembers.id, role: organizationMembers.role, createdAt: organizationMembers.createdAt, userId: users.id, email: users.email, name: users.name })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, tenant.organizationId)),
    getDb().select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.organizationId, tenant.organizationId)),
  ]);
  const canManage = roleCan(tenant.role, "org:manage");

  return <>
    <AppPageHeader kicker="Organization" title="Team" description="Manage organization access, policy/showback teams, project ownership and the service identities used by agents, CI, and gateway workloads." />
    <div className="app-stack">
      <MemberManager initialMembers={members} canManage={canManage} currentRole={tenant.role} />
      <TeamsManager canManage={canManage} organizationMembers={members.map((member) => ({ userId: member.userId, email: member.email, name: member.name }))} projects={projectRows} />
      <ServiceAccountsManager canManage={canManage} />
      <section className="app-panel"><div className="app-panel__body"><strong>Enterprise directory lifecycle</strong><p style={{ color: "var(--muted)", lineHeight: 1.6 }}>SAML/OIDC and Directory Sync remain WorkOS-backed enterprise connections. This page never reports SSO or SCIM as active unless an organization connection is actually configured.</p></div></section>
    </div>
  </>;
}
