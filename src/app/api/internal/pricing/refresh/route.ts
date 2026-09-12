import { latestPublishedPricingSnapshot, refreshOpenRouterPricing } from "@/lib/pricing/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function safeLatestPublishedPricingSnapshot() {
  try {
    return await latestPublishedPricingSnapshot();
  } catch {
    // Status/error reporting must remain safe before the optional pricing
    // persistence migration exists (unit tests, rolling deploys, fresh installs).
    return null;
  }
}

async function execute(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "PRICING_CRON_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!authorized(request)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!process.env.OPENROUTER_API_KEY) {
    const body = {
      skipped: request.method === "GET",
      reason: "OPENROUTER_API_KEY_NOT_CONFIGURED",
      lastPublished: await safeLatestPublishedPricingSnapshot(),
    };
    return Response.json(body, { status: request.method === "GET" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const data = await refreshOpenRouterPricing();
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "PRICING_REFRESH_FAILED",
      lastPublished: await safeLatestPublishedPricingSnapshot(),
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = execute;
export const POST = execute;
