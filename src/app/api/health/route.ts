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
  const healthy = database !== "error";

  return Response.json(
    {
      application: "ok",
      database,
      auth: configuration.auth,
      billing: configuration.stripe,
      credentialVault: configuration.credentialVault,
      github: configuration.github,
      otel: configuration.otel,
      redis: configuration.redis,
      mcp: "ok",
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
