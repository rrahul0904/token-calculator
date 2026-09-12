import process from "node:process";

type State = "PASS" | "FAIL" | "BLOCKED_EXTERNAL";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function clean(value: string) {
  return value.replace(/\/$/, "");
}

const baseUrl = clean(argument("base-url") ?? process.env.APP_BASE_URL ?? "");
const resource = clean(process.env.MCP_RESOURCE_URI ?? "");
const issuerRaw = process.env.WORKOS_AUTHKIT_DOMAIN?.trim() ?? "";
const issuer = issuerRaw ? clean(issuerRaw.includes("://") ? issuerRaw : `https://${issuerRaw}`) : "";
const strict = process.argv.includes("--require");

if (!baseUrl || !resource || !issuer) {
  const result = {
    provider: "mcp-oauth",
    state: "BLOCKED_EXTERNAL" as State,
    ready: false,
    blockers: ["MCP_OAUTH_RUNTIME_CONFIGURATION_MISSING"],
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (strict) process.exitCode = 2;
} else {
  try {
    const metadataUrl = new URL("/.well-known/oauth-protected-resource", baseUrl).toString();
    const [metadataResponse, jwksResponse] = await Promise.all([
      fetch(metadataUrl, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000) }),
      fetch(`${issuer}/oauth2/jwks`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000) }),
    ]);
    const metadata = metadataResponse.ok ? await metadataResponse.json() as {
      resource?: string;
      authorization_servers?: string[];
      scopes_supported?: string[];
      bearer_methods_supported?: string[];
    } : {};
    const jwks = jwksResponse.ok ? await jwksResponse.json() as { keys?: unknown[] } : {};

    const checks = {
      metadataHttp: metadataResponse.ok,
      resource: clean(metadata.resource ?? "") === resource,
      authorizationServer: Array.isArray(metadata.authorization_servers) && metadata.authorization_servers.map(clean).includes(issuer),
      scope: Array.isArray(metadata.scopes_supported) && metadata.scopes_supported.includes("mcp:tools"),
      bearerHeader: Array.isArray(metadata.bearer_methods_supported) && metadata.bearer_methods_supported.includes("header"),
      jwksHttp: jwksResponse.ok,
      jwksKeys: Array.isArray(jwks.keys) && jwks.keys.length > 0,
    };
    const state: State = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";
    process.stdout.write(JSON.stringify({ provider: "mcp-oauth", state, ready: state === "PASS", metadataUrl, checks }, null, 2) + "\n");
    if (state !== "PASS") process.exitCode = 2;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      provider: "mcp-oauth",
      state: "FAIL",
      ready: false,
      error: error instanceof Error ? error.name : "MCP_VERIFY_FAILED",
    }, null, 2) + "\n");
    process.exitCode = 2;
  }
}
