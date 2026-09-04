import { PlatformAdminAuthorizationError, recordPlatformAdminAudit, requirePlatformAdmin } from "@/lib/admin/auth";
import { getAdminOverviewData } from "@/lib/admin/data";

export async function GET() {
  try {
    const admin = await requirePlatformAdmin();
    await recordPlatformAdminAudit(admin, { action: "admin.overview.read", entityType: "platform" });
    return Response.json(await getAdminOverviewData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PlatformAdminAuthorizationError) return Response.json({ error: "PLATFORM_ADMIN_REQUIRED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
