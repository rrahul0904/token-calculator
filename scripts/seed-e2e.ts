import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organizationMembers, organizations, platformAdmins, projects, users } from "@/db/schema";

async function main() {
  if (process.env.TOKEN_INTELLIGENCE_E2E_SEED !== "1" || !process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET) {
    throw new Error("E2E seed is disabled. Set TOKEN_INTELLIGENCE_E2E_SEED=1 and an explicit E2E auth secret.");
  }
  const workosUserId = process.env.TOKEN_INTELLIGENCE_E2E_USER_ID ?? "user_e2e_owner";
  const workosOrganizationId = process.env.TOKEN_INTELLIGENCE_E2E_WORKOS_ORG_ID ?? "org_e2e";
  const email = process.env.TOKEN_INTELLIGENCE_E2E_USER_EMAIL ?? "e2e-owner@token-intelligence.invalid";
  const db = getDb();
  const userId = "usr_e2e_owner";
  const organizationId = "org_e2e_internal";
  const otherOrganizationId = "org_e2e_other";
  const secondaryWorkosUserId = process.env.TOKEN_INTELLIGENCE_E2E_SECONDARY_USER_ID;
  const secondaryEmail = process.env.TOKEN_INTELLIGENCE_E2E_SECONDARY_USER_EMAIL;

  await db.insert(users).values({ id: userId, workosUserId, email, name: "Token Intelligence E2E Owner" }).onConflictDoUpdate({
    target: users.id,
    set: { workosUserId, email, name: "Token Intelligence E2E Owner", updatedAt: new Date() },
  });
  if (process.env.TOKEN_INTELLIGENCE_E2E_PLATFORM_ADMIN === "1") {
    await db.insert(platformAdmins).values({ id: "pa_e2e_owner", userId, workosUserId, role: "super_admin" }).onConflictDoUpdate({
      target: platformAdmins.workosUserId,
      set: { userId, role: "super_admin", disabledAt: null, updatedAt: new Date() },
    });
  }
  await db.insert(organizations).values({ id: organizationId, workosOrganizationId, name: "Token Intelligence E2E", slug: "token-intelligence-e2e", plan: "enterprise" }).onConflictDoUpdate({
    target: organizations.id,
    set: { workosOrganizationId, name: "Token Intelligence E2E", plan: "enterprise", updatedAt: new Date() },
  });
  const membership = await db.select({ id: organizationMembers.id }).from(organizationMembers).where(eq(organizationMembers.userId, userId)).limit(1);
  if (!membership[0]) await db.insert(organizationMembers).values({ id: "mem_e2e_owner", organizationId, userId, role: "owner" });
  if (secondaryWorkosUserId && secondaryEmail) {
    const secondaryUserId = "usr_e2e_org_admin";
    await db.insert(users).values({ id: secondaryUserId, workosUserId: secondaryWorkosUserId, email: secondaryEmail, name: "Token Intelligence E2E Organization Admin" }).onConflictDoUpdate({ target: users.id, set: { workosUserId: secondaryWorkosUserId, email: secondaryEmail, updatedAt: new Date() } });
    await db.insert(organizationMembers).values({ id: "mem_e2e_org_admin", organizationId, userId: secondaryUserId, role: "admin" }).onConflictDoNothing();
  }
  await db.insert(projects).values({ id: "proj_e2e", organizationId, name: "E2E Project", slug: "e2e-project", description: "Disposable CI project" }).onConflictDoUpdate({
    target: projects.id,
    set: { name: "E2E Project", description: "Disposable CI project", updatedAt: new Date() },
  });

  await db.insert(organizations).values({ id: otherOrganizationId, name: "Other E2E Tenant", slug: "other-e2e-tenant", plan: "enterprise" }).onConflictDoUpdate({
    target: organizations.id,
    set: { name: "Other E2E Tenant", updatedAt: new Date() },
  });
  await db.insert(projects).values({ id: "proj_e2e_other", organizationId: otherOrganizationId, name: "Other Tenant Project", slug: "other-tenant-project", description: "Must never be visible to the primary E2E tenant" }).onConflictDoUpdate({
    target: projects.id,
    set: { name: "Other Tenant Project", description: "Must never be visible to the primary E2E tenant", updatedAt: new Date() },
  });

  console.log(JSON.stringify({ organizationId, userId, projectId: "proj_e2e", otherOrganizationId, otherProjectId: "proj_e2e_other", platformAdmin: process.env.TOKEN_INTELLIGENCE_E2E_PLATFORM_ADMIN === "1" }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
