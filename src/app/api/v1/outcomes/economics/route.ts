import { getOutcomeEconomicsData } from "@/lib/design-dashboard-data";
import { isDatabaseConfigured } from "@/db/client";
import { authenticateRequest } from "@/lib/auth/api-auth";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "read:runs");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  const data = await getOutcomeEconomicsData(principal.organizationId);
  return reply({ data });
}
