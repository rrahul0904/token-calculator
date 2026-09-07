import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OPENAPI_DOCUMENT } from "@/lib/openapi";

function routeFileForPath(path: string) {
  const segments = path.split("/").filter(Boolean).map((segment) => {
    const parameter = /^\{(.+)\}$/.exec(segment);
    return parameter ? `[${parameter[1]}]` : segment;
  });
  return resolve(process.cwd(), "src", "app", ...segments, "route.ts");
}

describe("OpenAPI implementation contract", () => {
  it("uses OpenAPI 3.1 and preserves measurement provenance", () => {
    expect(OPENAPI_DOCUMENT.openapi).toBe("3.1.0");
    expect(OPENAPI_DOCUMENT.components.schemas.UsageSource.enum).toEqual([
      "provider_measured",
      "agent_measured",
      "local_tokenizer_reference",
      "estimated",
      "reconciled",
    ]);
  });

  it("does not document API paths that have no route implementation", () => {
    const missing = Object.keys(OPENAPI_DOCUMENT.paths).filter((path) => !existsSync(routeFileForPath(path)));
    expect(missing).toEqual([]);
  });

  it("keeps release-critical compatibility, OAuth, data-control and FinOps surfaces discoverable", () => {
    const paths = OPENAPI_DOCUMENT.paths as Record<string, unknown>;
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/mcp",
      "/v1/responses",
      "/v1/chat/completions",
      "/v1/messages",
      "/api/v1/provider-usage-imports",
      "/api/v1/scenarios",
      "/api/v1/teams",
      "/api/v1/settings/retention",
      "/api/v1/settings/data-controls",
      "/api/v1/billing/checkout",
      "/api/v1/billing/portal",
    ]) expect(paths[path], path).toBeTruthy();
  });

  it("advertises MCP OAuth and API-key authentication without confusing advisory MCP checks with gateway enforcement", () => {
    expect(OPENAPI_DOCUMENT.components.securitySchemes.mcpOAuth.type).toBe("oauth2");
    const mcp = OPENAPI_DOCUMENT.paths["/mcp"].post;
    expect(mcp.security).toEqual([{ bearerAuth: [] }, { mcpOAuth: ["mcp:tools"] }]);
    expect(mcp.description).toMatch(/advisory/i);
    expect(mcp.description).toMatch(/gateway/i);
  });
});
