import { PlatformAdminAuthorizationError, recordPlatformAdminAudit, requirePlatformAdmin } from "@/lib/admin/auth";
import { getAdminSectionData } from "@/lib/admin/data";

const sections = new Set(["users", "organizations", "subscriptions", "revenue", "usage", "finops", "platform-costs", "providers", "system", "integrations", "audit", "release"]);

export async function GET(request: Request, { params }: { params: Promise<{ section: string }> }) {
  try {
    const { section } = await params;
    if (!sections.has(section)) return Response.json({ error: "ADMIN_SECTION_NOT_FOUND" }, { status: 404 });
    const admin = await requirePlatformAdmin();
    await recordPlatformAdminAudit(admin, { action: "admin.section.read", entityType: "admin_section", entityId: section });
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 1 || limit > 200 || offset < 0) return Response.json({ error: "INVALID_PAGINATION" }, { status: 400 });
    return Response.json(await getAdminSectionData(section, { limit, offset }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PlatformAdminAuthorizationError) return Response.json({ error: "PLATFORM_ADMIN_REQUIRED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
