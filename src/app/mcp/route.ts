import { eq } from "drizzle-orm";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { organizations } from "@/db/schema";
import { authenticateApiKey } from "@/lib/auth/api-auth";
import { PLAN_ENTITLEMENTS, hasEntitlement } from "@/lib/billing/entitlements";
import { createTokenIntelligenceMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(code: string, status: number) {
  return Response.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

function originAllowed(request: Request) {
  const base = process.env.APP_BASE_URL;
  if (!base) return true;
  const expected = new URL(base);
  const origin = request.headers.get("origin");
  if (origin && origin !== expected.origin) return false;
  const host = request.headers.get("host");
  if (host && host !== expected.host) return false;
  return true;
}

async function serve(request: Request) {
  if (!originAllowed(request)) return error("MCP_ORIGIN_NOT_ALLOWED", 403);
  if (!isDatabaseConfigured()) return error("DATABASE_NOT_CONFIGURED", 503);
  const principal = await authenticateApiKey(request, "mcp:tools");
  if (!principal) return error("MCP_API_KEY_REQUIRED", 401);

  const organization = (await getDb().select({ plan: organizations.plan }).from(organizations).where(eq(organizations.id, principal.organizationId)).limit(1))[0];
  if (!organization) return error("ORGANIZATION_NOT_FOUND", 404);
  const plan = organization.plan as keyof typeof PLAN_ENTITLEMENTS;
  if (!hasEntitlement(PLAN_ENTITLEMENTS[plan], "mcp_access")) return error("PLAN_UPGRADE_REQUIRED", 402);

  const handler = createMcpHandler(() => createTokenIntelligenceMcpServer(principal), {
    onerror: (mcpError) => console.error("MCP request failed", { name: mcpError.name, message: mcpError.message }),
  });
  const response = await handler.fetch(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
