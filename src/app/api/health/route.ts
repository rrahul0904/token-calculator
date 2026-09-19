import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getConfigurationStatus } from "@/lib/config";
import { inspectWorkosWebhookProvider, workosWebhookTargetForRequestUrl } from "@/lib/workos/webhook-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DatabaseStatus = "ok" | "not_configured" | "error";
type DatabaseIdentity = "verified" | "unchecked" | "mismatch" | "not_configured" | "error";

async function databaseHealth(): Promise<{ status: DatabaseStatus; identity: DatabaseIdentity }> {
  if (!isDatabaseConfigured()) return { status: "not_configured", identity: "not_configured" };

  const expectedProject = process.env.TOKEN_INTELLIGENCE_EXPECTED_NEON_PROJECT_ID?.trim();
  const expectedBranch = process.env.TOKEN_INTELLIGENCE_EXPECTED_NEON_BRANCH_ID?.trim();

  try {
    const rows = await getDb().execute(sql`
      select
        current_setting('neon.project_id', true) as project_id,
        current_setting('neon.branch_id', true) as branch_id
    `);
    const row = rows[0] as { project_id?: string | null; branch_id?: string | null } | undefined;

    if (!expectedProject && !expectedBranch) {
      return { status: "ok", identity: "unchecked" };
    }

    const identityVerified = Boolean(
      expectedProject &&
      expectedBranch &&
      row?.project_id === expectedProject &&
      row?.branch_id === expectedBranch,
    );

    return identityVerified
      ? { status: "ok", identity: "verified" }
      : { status: "error", identity: "mismatch" };
  } catch {
    return { status: "error", identity: "error" };
  }
}

export async function GET(request: Request) {
  const configuration = getConfigurationStatus();
  const databaseHealthResult = await databaseHealth();
  const database = databaseHealthResult.status;
  let workosWebhook = configuration.workosWebhook;
  if (
    workosWebhook === "live"
    && process.env.WORKOS_API_KEY
    && !process.env.WORKOS_WEBHOOK_SECRET
  ) {
    const provider = await inspectWorkosWebhookProvider({
      targetUrl: workosWebhookTargetForRequestUrl(request.url),
    });
    if (!provider.ready) workosWebhook = "code_complete_configuration_blocked";
  }
  const releaseChecks = {
    database: database === "ok",
    auth: configuration.auth === "live",
    workosWebhook: workosWebhook === "live",
    mcpOAuth: configuration.mcpOAuth === "live",
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
      databaseIdentity: databaseHealthResult.identity,
      auth: configuration.auth,
      billing: configuration.stripe,
      credentialVault: configuration.credentialVault,
      github: configuration.github,
      alerts: configuration.alerts,
      retention: configuration.retention,
      otel: configuration.otel,
      redis: configuration.redis,
      mcp: "ok",
      workosWebhook,
      mcpOAuth: configuration.mcpOAuth,
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
