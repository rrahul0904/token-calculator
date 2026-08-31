import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organizationMembers, users } from "@/db/schema";
import { AppPageHeader, StatusBadge } from "@/components/app-ui";
import { ServiceAccountsManager } from "@/components/service-accounts-manager";
import { getTenantContext, roleCan } from "@/lib/auth/session";

export default async function TeamPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const members = await getDb()
    .select({ id: organizationMembers.id, role: organizationMembers.role, createdAt: organizationMembers.createdAt, userId: users.id, email: users.email, name: users.name })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, tenant.organizationId));
  const canManage = roleCan(tenant.role, "org:manage");

  return <>
    <AppPageHeader kicker="Organization" title="Team" description="See who can access this workspace and manage non-human identities used by agents, CI, and gateway workloads." />
    <div className="app-stack">
      <section className="app-panel"><div className="app-panel__header"><div><h2>Members</h2><p>Membership and role checks are enforced again on server actions; hiding UI is not the authorization boundary.</p></div></div><div className="app-table-wrap"><table className="app-table"><thead><tr><th>Member</th><th>Role</th><th>Joined</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.name ?? member.email}</strong><br/><small>{member.email}</small></td><td><StatusBadge status={member.role} /></td><td>{new Date(member.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></section>
      <ServiceAccountsManager canManage={canManage} />
      <section className="app-panel"><div className="app-panel__body"><strong>Enterprise directory lifecycle</strong><p style={{ color: "var(--muted)", lineHeight: 1.6 }}>SAML/OIDC and Directory Sync remain WorkOS-backed enterprise connections. This page never reports SSO or SCIM as active unless an organization connection is actually configured.</p></div></section>
    </div>
  </>;
}
