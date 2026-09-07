import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getConfigurationStatus } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function databaseHealth(): Promise<"ok" | "not_configured" | "error"> {
  if (!isDatabaseConfigured()) return "not_configured";
  try {
    await getDb().execute(sql`select 1 as ok`);
    return "ok";
  } catch {
    return "error";
  }
}

export async function GET() {
  const configuration = getConfigurationStatus();
  const database = await databaseHealth();
  const mcpOAuth = process.env.WORKOS_AUTHKIT_DOMAIN && process.env.MCP_RESOURCE_URI ? "live" : "not_enabled";
  const releaseChecks = {
    database: database === "ok",
    auth: configuration.auth === "live",
    billing: configuration.stripe === "live",
    credentialVault: configuration.credentialVault === "live",
    retention: configuration.retention === "live",
  };
  const releaseReady = Object.values(releaseChecks).every(Boolean);
  const production = process.env.VERCEL_ENV === "production";
  const unhealthy = database === "error" || (production && !releaseReady);

  return Response.json(
    {
      application: "ok",
      database,
      auth: configuration.auth,
      billing: configuration.stripe,
      credentialVault: configuration.credentialVault,
      github: configuration.github,
      alerts: configuration.alerts,
      retention: configuration.retention,
      otel: configuration.otel,
      redis: configuration.redis,
      mcp: "ok",
      mcpOAuth,
      releaseReady,
      releaseChecks,
      timestamp: new Date().toISOString(),
    },
    {
      status: unhealthy ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
