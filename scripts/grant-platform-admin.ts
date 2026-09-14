import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/db/client";
import { platformAdminAuditEvents, platformAdmins, users, type PlatformAdminRole } from "@/db/schema";

const roles = new Set<PlatformAdminRole>(["super_admin", "operations", "finance", "support", "read_only"]);
async function main() {
  const [workosUserId, role = "read_only", actorWorkosUserId = "system_cli"] = process.argv.slice(2);
  if (!isDatabaseConfigured() || !workosUserId || !roles.has(role as PlatformAdminRole)) throw new Error("Usage: DATABASE_URL=... npx tsx scripts/grant-platform-admin.ts <workos_user_id> <super_admin|operations|finance|support|read_only>");
  const db = getDb(); const user = await db.query.users.findFirst({ where: eq(users.workosUserId, workosUserId) });
  await db.insert(platformAdmins).values({ id: `pa_${randomUUID()}`, userId: user?.id ?? null, workosUserId, role }).onConflictDoUpdate({ target: platformAdmins.workosUserId, set: { userId: user?.id ?? null, role, disabledAt: null, updatedAt: new Date() } });
  await db.insert(platformAdminAuditEvents).values({ id: `pae_${randomUUID()}`, actorWorkosUserId, action: "platform_admin.grant", entityType: "platform_admin", entityId: workosUserId, metadata: { role, source: "admin_grant_cli" } });
  process.stdout.write(`Platform administrator granted: ${role}\n`);
}
main().finally(() => closeDb());
