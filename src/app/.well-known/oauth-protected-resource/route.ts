import { mcpAuthorizationServer, mcpResourceUri } from "@/lib/auth/mcp-oauth";

export const dynamic = "force-dynamic";

export function GET() {
  const resource = mcpResourceUri();
  const authorizationServer = mcpAuthorizationServer();
  if (!resource || !authorizationServer) {
    return Response.json({ error: "MCP_OAUTH_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({
    resource,
    authorization_servers: [authorizationServer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp:tools"],
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
