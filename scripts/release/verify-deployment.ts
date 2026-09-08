import process from "node:process";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string) {
  const value = argument(name);
  if (!value) throw new Error(`MISSING_ARGUMENT:${name}`);
  return value;
}

const mode = argument("mode") === "production" ? "production" : "preview";
const expectedSha = required("sha");
const baseUrl = required("url").replace(/\/$/, "");
const publicPaths = [
  "/", "/models", "/pricing", "/developers", "/guides",
  "/guides/openai", "/guides/anthropic", "/guides/gemini",
  "/tools/cost", "/openapi.json", "/sitemap.xml",
];

async function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) {
    headers.set("x-vercel-protection-bypass", bypass);
    headers.set("x-vercel-set-bypass-cookie", "true");
  }
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
    ...init,
    headers,
  });
}

const routeResults: Record<string, number> = {};
for (const path of publicPaths) {
  const response = await request(path);
  routeResults[path] = response.status;
  if (response.status >= 400) throw new Error(`DEPLOYMENT_ROUTE_FAILED:${path}:${response.status}`);
}

const buildResponse = await request("/api/build");
if (!buildResponse.ok) throw new Error(`BUILD_IDENTITY_HTTP_${buildResponse.status}`);
const build = await buildResponse.json() as {
  gitSha?: string;
  environment?: string;
  deploymentId?: string | null;
  version?: string;
};
if (build.gitSha !== expectedSha) {
  throw new Error(`BUILD_SHA_MISMATCH:expected=${expectedSha}:actual=${build.gitSha ?? "missing"}`);
}

const healthResponse = await request("/api/health");
const health = await healthResponse.json().catch(() => ({})) as {
  releaseReady?: boolean;
  application?: string;
  database?: string;
};
if (!healthResponse.ok || health.releaseReady !== true) {
  throw new Error(`HEALTH_NOT_RELEASE_READY:http=${healthResponse.status}:releaseReady=${String(health.releaseReady)}`);
}

const signIn = await request("/sign-in");
if (signIn.status >= 500) throw new Error(`SIGN_IN_CONFIGURATION_FAILED:${signIn.status}`);

const malformedCallback = await request("/auth/callback");
if (![400, 401].includes(malformedCallback.status)) {
  throw new Error(`CALLBACK_FAIL_CLOSED_UNEXPECTED:${malformedCallback.status}`);
}

const mcp = await request("/mcp", { headers: { accept: "application/json" } });
const challenge = mcp.headers.get("www-authenticate");
if (mcp.status !== 401 || !challenge?.includes("resource_metadata")) {
  throw new Error(`MCP_CHALLENGE_INVALID:${mcp.status}`);
}

process.stdout.write(JSON.stringify({
  mode,
  certified: true,
  baseUrl,
  expectedSha,
  build,
  health: {
    status: healthResponse.status,
    application: health.application,
    database: health.database,
    releaseReady: health.releaseReady,
  },
  auth: {
    signInStatus: signIn.status,
    malformedCallbackStatus: malformedCallback.status,
  },
  mcp: { status: mcp.status, challenge: true },
  routes: routeResults,
}, null, 2) + "\n");
