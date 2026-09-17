import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

function buildSha() {
  return process.env.NEXT_PUBLIC_TOKEN_INTELLIGENCE_BUILD_SHA
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.GITHUB_SHA
    ?? "unknown";
}

export function GET() {
  return Response.json({
    application: "token-intelligence",
    version: packageJson.version,
    gitSha: buildSha(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    buildTime: process.env.NEXT_PUBLIC_TOKEN_INTELLIGENCE_BUILD_TIME ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}
