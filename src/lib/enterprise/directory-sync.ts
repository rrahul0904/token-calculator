import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditEvents, organizationMembers, organizations, users } from "@/db/schema";
import { teamMembers, teams } from "@/db/gap-closure-schema";
import { workosDirectoryEvents, workosDirectoryGroups, workosDirectoryUsers } from "@/db/enterprise-schema";

export interface DirectoryLifecycleEvent {
  id: string;
  event: string;
  data: Record<string, unknown>;
}

function rec(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function primaryEmail(data: Record<string, unknown>): string | null {
  const direct = text(data.email);
  if (direct) return direct.toLowerCase();
  if (!Array.isArray(data.emails)) return null;
  const emails = data.emails.map(rec).filter((item): item is Record<string, unknown> => Boolean(item));
  const selected = emails.find((item) => item.primary === true) ?? emails[0];
  return text(selected?.value)?.toLowerCase() ?? null;
}
function displayName(data: Record<string, unknown>): string | null {
  const first = text(data.first_name) ?? text(data.firstName);
  const last = text(data.last_name) ?? text(data.lastName);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || text(data.name) || text(data.username);
}
function directoryId(data: Record<string, unknown>): string | null {
  return text(data.directory_id) ?? text(data.directoryId) ?? text(rec(data.directory)?.id);
}
function organizationExternalId(data: Record<string, unknown>): string | null {
  return text(data.organization_id) ?? text(data.organizationId) ?? text(rec(data.organization)?.id);
}
function directoryUserId(data: Record<string, unknown>): string | null {
  return text(data.id) ?? text(data.user_id) ?? text(data.userId) ?? text(rec(data.user)?.id);
}
function directoryGroupId(data: Record<string, unknown>): string | null {
  return text(data.id) ?? text(data.group_id) ?? text(data.groupId) ?? text(rec(data.group)?.id);
}
function stateOf(data: Record<string, unknown>) {
  return (text(data.state) ?? "active").toLowerCase();
}
function groupName(data: Record<string, unknown>) {
  return text(data.name) ?? text(rec(data.group)?.name) ?? "Directory group";
}
function directorySlug(externalId: string) {
  return `directory-${externalId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(-80) || "group"}`;
}

async function internalOrganizationId(workosOrganizationId: string) {
  const row = await getDb().select({ id: organizations.id }).from(organizations).where(eq(organizations.workosOrganizationId, workosOrganizationId)).limit(1);
  return row[0]?.id ?? null;
}

function assertMappingOrganization(mappingOrganizationId: string | undefined, organizationId: string) {
  if (mappingOrganizationId && mappingOrganizationId !== organizationId) throw new Error("DIRECTORY_SCOPE_VIOLATION");
}

export async function processDirectoryLifecycleEvent(input: DirectoryLifecycleEvent) {
  const workosOrganizationId = organizationExternalId(input.data);
  const dirId = directoryId(input.data);
  if (!workosOrganizationId) return { processed: false, reason: "DIRECTORY_ORGANIZATION_MISSING" } as const;
  const organizationId = await internalOrganizationId(workosOrganizationId);
  if (!organizationId) return { processed: false, reason: "ORGANIZATION_NOT_FOUND" } as const;

  return getDb().transaction(async (tx) => {
    const inserted = await tx.insert(workosDirectoryEvents).values({
      eventId: input.id,
      organizationId,
      eventType: input.event,
      directoryId: dirId,
    }).onConflictDoNothing().returning({ eventId: workosDirectoryEvents.eventId });
    if (!inserted[0]) return { processed: false, duplicate: true } as const;

    const ensureOrgMembership = async (internalUserId: string, active: boolean) => {
      const membership = await tx.select().from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, internalUserId))).limit(1);
      if (active) {
        if (!membership[0]) await tx.insert(organizationMembers).values({ id: `mem_${randomUUID()}`, organizationId, userId: internalUserId, role: "developer" });
      } else if (membership[0] && membership[0].role !== "owner") {
        await tx.delete(organizationMembers).where(eq(organizationMembers.id, membership[0].id));
      }
    };

    const upsertDirectoryUser = async (data: Record<string, unknown>, forceDeleted = false) => {
      const externalUserId = directoryUserId(data);
      const userDirectoryId = directoryId(data) ?? dirId;
      if (!externalUserId || !userDirectoryId) return;
      const email = primaryEmail(data);
      const name = displayName(data);
      const state = forceDeleted ? "deleted" : stateOf(data);
      const active = state === "active";
      const mapping = await tx.select().from(workosDirectoryUsers).where(eq(workosDirectoryUsers.directoryUserId, externalUserId)).limit(1);
      assertMappingOrganization(mapping[0]?.organizationId, organizationId);
      let internalUserId = mapping[0]?.internalUserId ?? null;
      if (!internalUserId && email) {
        const existing = await tx.select().from(users).where(eq(users.email, email)).limit(1);
        internalUserId = existing[0]?.id ?? null;
        if (!internalUserId) {
          internalUserId = `usr_${randomUUID()}`;
          await tx.insert(users).values({ id: internalUserId, email, name });
        }
      }
      if (internalUserId && name) await tx.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, internalUserId));
      if (mapping[0]) {
        await tx.update(workosDirectoryUsers).set({ directoryId: userDirectoryId, internalUserId, email, name, state, updatedAt: new Date() })
          .where(and(eq(workosDirectoryUsers.directoryUserId, externalUserId), eq(workosDirectoryUsers.organizationId, organizationId)));
      } else {
        await tx.insert(workosDirectoryUsers).values({ directoryUserId: externalUserId, organizationId, directoryId: userDirectoryId, internalUserId, email, name, state });
      }
      if (internalUserId) await ensureOrgMembership(internalUserId, active);
    };

    const upsertDirectoryGroup = async (data: Record<string, unknown>, deleted = false) => {
      const externalGroupId = directoryGroupId(data);
      const groupDirectoryId = directoryId(data) ?? dirId;
      if (!externalGroupId || !groupDirectoryId) return;
      const name = groupName(data);
      const mapping = await tx.select().from(workosDirectoryGroups).where(eq(workosDirectoryGroups.directoryGroupId, externalGroupId)).limit(1);
      assertMappingOrganization(mapping[0]?.organizationId, organizationId);
      let teamId = mapping[0]?.teamId ?? null;
      if (!teamId && !deleted) {
        teamId = `team_${randomUUID()}`;
        await tx.insert(teams).values({ id: teamId, organizationId, name, slug: directorySlug(externalGroupId) });
      } else if (teamId) {
        await tx.update(teams).set({ name, archivedAt: deleted ? new Date() : null, updatedAt: new Date() }).where(and(eq(teams.id, teamId), eq(teams.organizationId, organizationId)));
      }
      if (mapping[0]) {
        await tx.update(workosDirectoryGroups).set({ directoryId: groupDirectoryId, teamId, name, state: deleted ? "deleted" : "active", updatedAt: new Date() })
          .where(and(eq(workosDirectoryGroups.directoryGroupId, externalGroupId), eq(workosDirectoryGroups.organizationId, organizationId)));
      } else {
        await tx.insert(workosDirectoryGroups).values({ directoryGroupId: externalGroupId, organizationId, directoryId: groupDirectoryId, teamId, name, state: deleted ? "deleted" : "active" });
      }
    };

    const changeGroupMembership = async (data: Record<string, unknown>, add: boolean) => {
      const userData = rec(data.user) ?? data;
      const groupData = rec(data.group) ?? data;
      const externalUserId = text(rec(data.user)?.id) ?? text(data.user_id) ?? text(data.userId);
      const externalGroupId = text(rec(data.group)?.id) ?? text(data.group_id) ?? text(data.groupId);
      if (!externalUserId || !externalGroupId) return;
      const [userMap] = await tx.select().from(workosDirectoryUsers).where(eq(workosDirectoryUsers.directoryUserId, externalUserId)).limit(1);
      let [groupMap] = await tx.select().from(workosDirectoryGroups).where(eq(workosDirectoryGroups.directoryGroupId, externalGroupId)).limit(1);
      assertMappingOrganization(userMap?.organizationId, organizationId);
      assertMappingOrganization(groupMap?.organizationId, organizationId);
      if (!userMap) await upsertDirectoryUser(userData);
      if (!groupMap) {
        await upsertDirectoryGroup(groupData);
        [groupMap] = await tx.select().from(workosDirectoryGroups).where(and(eq(workosDirectoryGroups.directoryGroupId, externalGroupId), eq(workosDirectoryGroups.organizationId, organizationId))).limit(1);
      }
      const [resolvedUser] = await tx.select().from(workosDirectoryUsers).where(and(eq(workosDirectoryUsers.directoryUserId, externalUserId), eq(workosDirectoryUsers.organizationId, organizationId))).limit(1);
      if (!resolvedUser?.internalUserId || !groupMap?.teamId) return;
      if (add) {
        await tx.insert(teamMembers).values({ id: `tm_${randomUUID()}`, organizationId, teamId: groupMap.teamId, userId: resolvedUser.internalUserId, role: "member" }).onConflictDoNothing();
      } else {
        await tx.delete(teamMembers).where(and(eq(teamMembers.organizationId, organizationId), eq(teamMembers.teamId, groupMap.teamId), eq(teamMembers.userId, resolvedUser.internalUserId)));
      }
    };

    if (input.event === "dsync.user.created" || input.event === "dsync.user.updated") await upsertDirectoryUser(input.data);
    else if (input.event === "dsync.user.deleted") await upsertDirectoryUser(input.data, true);
    else if (input.event === "dsync.group.created" || input.event === "dsync.group.updated") await upsertDirectoryGroup(input.data);
    else if (input.event === "dsync.group.deleted") await upsertDirectoryGroup(input.data, true);
    else if (input.event === "dsync.group.user_added") await changeGroupMembership(input.data, true);
    else if (input.event === "dsync.group.user_removed") await changeGroupMembership(input.data, false);
    else if (input.event === "dsync.deleted" && dirId) {
      const mappedUsers = await tx.select().from(workosDirectoryUsers).where(and(eq(workosDirectoryUsers.organizationId, organizationId), eq(workosDirectoryUsers.directoryId, dirId)));
      for (const mapped of mappedUsers) {
        if (mapped.internalUserId) await ensureOrgMembership(mapped.internalUserId, false);
      }
      await tx.update(workosDirectoryUsers).set({ state: "deleted", updatedAt: new Date() }).where(and(eq(workosDirectoryUsers.organizationId, organizationId), eq(workosDirectoryUsers.directoryId, dirId)));
      const mappedGroups = await tx.select().from(workosDirectoryGroups).where(and(eq(workosDirectoryGroups.organizationId, organizationId), eq(workosDirectoryGroups.directoryId, dirId)));
      for (const mapped of mappedGroups) {
        if (mapped.teamId) await tx.update(teams).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(teams.id, mapped.teamId), eq(teams.organizationId, organizationId)));
      }
      await tx.update(workosDirectoryGroups).set({ state: "deleted", updatedAt: new Date() }).where(and(eq(workosDirectoryGroups.organizationId, organizationId), eq(workosDirectoryGroups.directoryId, dirId)));
    }

    await tx.insert(auditEvents).values({
      id: `aud_${randomUUID()}`,
      organizationId,
      actorType: "workos_directory",
      actorId: dirId,
      action: input.event,
      resourceType: "directory_sync",
      resourceId: input.id,
      details: { eventId: input.id, directoryId: dirId, rawAttributesStored: false },
    });
    return { processed: true, duplicate: false, organizationId } as const;
  });
}
