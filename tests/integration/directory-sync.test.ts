import process from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { processDirectoryLifecycleEvent } from "@/lib/enterprise/directory-sync";

const integrationEnabled = process.env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("WorkOS Directory lifecycle", () => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: process.env.DATABASE_SSL === "disable" ? false : "require" });
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const orgA = `dir_org_a_${suffix}`;
  const orgB = `dir_org_b_${suffix}`;
  const workosOrgA = `org_dir_a_${suffix}`;
  const workosOrgB = `org_dir_b_${suffix}`;
  const directoryA = `directory_a_${suffix}`;
  const directoryB = `directory_b_${suffix}`;
  const externalUser = `directory_user_${suffix}`;
  const externalGroup = `directory_group_${suffix}`;
  const email = `directory-${suffix}@token-intelligence.invalid`;

  beforeAll(async () => {
    await sql`insert into organizations (id, workos_organization_id, name, slug, plan) values
      (${orgA}, ${workosOrgA}, 'Directory Org A', ${`directory-a-${suffix}`}, 'enterprise'),
      (${orgB}, ${workosOrgB}, 'Directory Org B', ${`directory-b-${suffix}`}, 'enterprise')`;
  });

  afterAll(async () => {
    await closeDb();
    await sql`delete from organizations where id in (${orgA}, ${orgB})`;
    await sql`delete from users where email = ${email}`;
    await sql.end({ timeout: 3 });
  });

  it("provisions a least-privilege developer and treats duplicate delivery idempotently", async () => {
    const event = {
      id: `evt_user_create_${suffix}`,
      event: "dsync.user.created",
      data: {
        id: externalUser,
        organization_id: workosOrgA,
        directory_id: directoryA,
        state: "active",
        emails: [{ primary: true, value: email }],
        first_name: "Directory",
        last_name: "User",
      },
    };

    expect(await processDirectoryLifecycleEvent(event)).toMatchObject({ processed: true, duplicate: false, organizationId: orgA });
    expect(await processDirectoryLifecycleEvent(event)).toMatchObject({ processed: false, duplicate: true });

    const memberships = await sql<{ role: string }[]>`
      select om.role
      from organization_members om
      join users u on u.id = om.user_id
      where om.organization_id = ${orgA} and u.email = ${email}
    `;
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("developer");

    const events = await sql<{ count: number }[]>`select count(*)::int as count from workos_directory_events where event_id = ${event.id}`;
    expect(events[0]?.count).toBe(1);
  });

  it("maps a Directory group to a team and synchronizes membership", async () => {
    await processDirectoryLifecycleEvent({
      id: `evt_group_create_${suffix}`,
      event: "dsync.group.created",
      data: { id: externalGroup, organization_id: workosOrgA, directory_id: directoryA, name: "Platform Engineering" },
    });
    await processDirectoryLifecycleEvent({
      id: `evt_group_add_${suffix}`,
      event: "dsync.group.user_added",
      data: {
        organization_id: workosOrgA,
        directory_id: directoryA,
        user: { id: externalUser, directory_id: directoryA },
        group: { id: externalGroup, directory_id: directoryA, name: "Platform Engineering" },
      },
    });

    const rows = await sql<{ team_name: string; email: string }[]>`
      select t.name as team_name, u.email
      from team_members tm
      join teams t on t.id = tm.team_id
      join users u on u.id = tm.user_id
      where tm.organization_id = ${orgA} and u.email = ${email}
    `;
    expect(rows).toEqual([{ team_name: "Platform Engineering", email }]);

    await processDirectoryLifecycleEvent({
      id: `evt_group_remove_${suffix}`,
      event: "dsync.group.user_removed",
      data: {
        organization_id: workosOrgA,
        directory_id: directoryA,
        user: { id: externalUser },
        group: { id: externalGroup },
      },
    });
    const removed = await sql<{ count: number }[]>`select count(*)::int as count from team_members where organization_id = ${orgA}`;
    expect(removed[0]?.count).toBe(0);
  });

  it("fails closed if another tenant replays an existing external Directory identity", async () => {
    await expect(processDirectoryLifecycleEvent({
      id: `evt_cross_tenant_${suffix}`,
      event: "dsync.user.updated",
      data: {
        id: externalUser,
        organization_id: workosOrgB,
        directory_id: directoryB,
        state: "active",
        emails: [{ primary: true, value: email }],
      },
    })).rejects.toThrow("DIRECTORY_SCOPE_VIOLATION");

    const mapping = await sql<{ organization_id: string }[]>`select organization_id from workos_directory_users where directory_user_id = ${externalUser}`;
    expect(mapping).toEqual([{ organization_id: orgA }]);
    const rolledBackEvent = await sql<{ count: number }[]>`select count(*)::int as count from workos_directory_events where event_id = ${`evt_cross_tenant_${suffix}`}`;
    expect(rolledBackEvent[0]?.count).toBe(0);
  });

  it("does not remove an owner membership during Directory deprovisioning", async () => {
    await sql`
      update organization_members
      set role = 'owner'
      where organization_id = ${orgA}
        and user_id = (select id from users where email = ${email})
    `;
    await processDirectoryLifecycleEvent({
      id: `evt_user_delete_${suffix}`,
      event: "dsync.user.deleted",
      data: { id: externalUser, organization_id: workosOrgA, directory_id: directoryA, state: "inactive", email },
    });
    const memberships = await sql<{ role: string }[]>`
      select om.role from organization_members om
      join users u on u.id = om.user_id
      where om.organization_id = ${orgA} and u.email = ${email}
    `;
    expect(memberships).toEqual([{ role: "owner" }]);
  });
});
