const noContent = { description: "Success" };
const bearer = [{ bearerAuth: [] }];
const session = [{ cookieAuth: [] }];
const mcpSecurity = [{ bearerAuth: [] }, { mcpOAuth: ["mcp:tools"] }];

function operation(summary: string, options: { security?: object[]; request?: object; tags?: string[]; description?: string } = {}) {
  return {
    summary,
    description: options.description,
    tags: options.tags,
    security: options.security,
    requestBody: options.request ? { required: true, content: { "application/json": { schema: options.request } } } : undefined,
    responses: {
      "200": noContent,
      "201": { description: "Created" },
      "400": { description: "Invalid request" },
      "401": { description: "Unauthorized" },
      "403": { description: "Forbidden" },
      "404": { description: "Not found" },
      "409": { description: "Conflict" },
      "429": { description: "Quota/rate limit exceeded" },
      "503": { description: "Required service not configured or unavailable" },
    },
  };
}

const authkitDomain = process.env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/$/, "");
const oauthAuthorizationUrl = authkitDomain ? `${authkitDomain}/oauth2/authorize` : "https://YOUR_AUTHKIT_DOMAIN/oauth2/authorize";
const oauthTokenUrl = authkitDomain ? `${authkitDomain}/oauth2/token` : "https://YOUR_AUTHKIT_DOMAIN/oauth2/token";

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "Token Intelligence API",
    version: "1.1.0",
    description: "AI economics, agent-run telemetry, FinOps, budgets, model economics, governed provider gateway and MCP APIs. Measurement provenance is preserved as provider_measured, agent_measured, local_tokenizer_reference, estimated, or reconciled. Prompt/code content is not persisted by default.",
  },
  servers: [{ url: process.env.APP_BASE_URL ?? "https://token-intelligence-eight.vercel.app" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Token Intelligence API key" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "wos-session", description: "WorkOS AuthKit browser session." },
      mcpOAuth: {
        type: "oauth2",
        description: "WorkOS/AuthKit OAuth resource-server authorization for MCP. Discover resource metadata at /.well-known/oauth-protected-resource.",
        flows: { authorizationCode: { authorizationUrl: oauthAuthorizationUrl, tokenUrl: oauthTokenUrl, scopes: { "mcp:tools": "Use Token Intelligence MCP tools" } } },
      },
    },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
      UsageSource: { type: "string", enum: ["provider_measured", "agent_measured", "local_tokenizer_reference", "estimated", "reconciled"] },
      TokenizeRequest: { type: "object", properties: { text: { type: "string", maxLength: 500000 } }, required: ["text"] },
      EstimateRequest: { type: "object", properties: { inputTokens: { type: "integer", minimum: 0 }, outputTokens: { type: "integer", minimum: 0 }, cachedInputTokens: { type: "integer", minimum: 0 }, requestsPerMonth: { type: "integer", minimum: 1 } }, required: ["inputTokens", "outputTokens"] },
      GatewayRequest: { type: "object", properties: { providerConnectionId: { type: "string" }, projectId: { type: ["string", "null"] }, runId: { type: "string" }, agentName: { type: "string" }, workflowName: { type: ["string", "null"] }, environment: { type: "string" }, model: { type: "string" }, fallbackModel: { type: "string" }, input: {}, maxOutputTokens: { type: "integer" }, stream: { type: "boolean" } }, required: ["providerConnectionId", "model", "input"] },
      ProviderCompatibleRequest: { type: "object", additionalProperties: true, description: "Provider-compatible request body. Supply x-ti-provider-connection-id; project/run metadata may be supplied with x-ti-* headers." },
    },
  },
  paths: {
    "/api/health": { get: operation("Deployment health", { tags: ["Operations"] }) },
    "/.well-known/oauth-protected-resource": { get: operation("MCP OAuth protected-resource metadata", { tags: ["MCP", "Identity"] }) },
    "/api/v1/tokenize": { post: operation("Tokenize text without persistence", { request: { $ref: "#/components/schemas/TokenizeRequest" }, tags: ["Economics"] }) },
    "/api/v1/models": { get: operation("List model catalog and pricing provenance", { tags: ["Economics"] }) },
    "/api/v1/estimate": { post: operation("Estimate model costs", { request: { $ref: "#/components/schemas/EstimateRequest" }, tags: ["Economics"] }) },
    "/api/v1/compare": { post: operation("Compare model economics", { tags: ["Economics"] }) },
    "/api/v1/recommend": { post: operation("Recommend economically compatible models", { tags: ["Economics"] }) },
    "/api/v1/onboarding": { post: operation("Create or attach authenticated user workspace", { security: session, tags: ["Identity"] }) },
    "/api/v1/projects": { get: operation("List projects", { security: session, tags: ["Projects"] }), post: operation("Create a project", { security: session, tags: ["Projects"] }) },
    "/api/v1/projects/{id}": { get: operation("Get project detail", { security: session, tags: ["Projects"] }), patch: operation("Edit/archive/restore project", { security: session, tags: ["Projects"] }) },
    "/api/v1/teams": { get: operation("List organization teams", { security: session, tags: ["Identity"] }), post: operation("Create a team", { security: session, tags: ["Identity"] }) },
    "/api/v1/teams/{id}": { patch: operation("Update/archive a team", { security: session, tags: ["Identity"] }), delete: operation("Delete a team", { security: session, tags: ["Identity"] }) },
    "/api/v1/teams/{id}/members": { post: operation("Add team membership", { security: session, tags: ["Identity"] }), delete: operation("Remove team membership", { security: session, tags: ["Identity"] }) },
    "/api/v1/teams/{id}/projects": { post: operation("Attach project to team", { security: session, tags: ["Projects"] }), delete: operation("Detach project from team", { security: session, tags: ["Projects"] }) },
    "/api/v1/members/{id}": { patch: operation("Change organization role with last-owner protection", { security: session, tags: ["Identity"] }), delete: operation("Remove organization member with last-owner protection", { security: session, tags: ["Identity"] }) },
    "/api/v1/service-accounts": { get: operation("List service accounts", { security: session, tags: ["Identity"] }), post: operation("Create service account", { security: session, tags: ["Identity"] }) },
    "/api/v1/service-accounts/{id}": { delete: operation("Revoke service account and its keys", { security: session, tags: ["Identity"] }) },
    "/api/v1/api-keys": { get: operation("List API keys without secret material", { security: session, tags: ["Identity"] }), post: operation("Create an API key; secret returned once", { security: session, tags: ["Identity"] }) },
    "/api/v1/api-keys/{id}": { patch: operation("Rotate an API key; new secret returned once", { security: session, tags: ["Identity"] }), delete: operation("Revoke an API key", { security: session, tags: ["Identity"] }) },
    "/api/v1/api-keys/{id}/quota": { get: operation("Get API-key quota", { security: session, tags: ["Control"] }), patch: operation("Set API-key quota", { security: session, tags: ["Control"] }) },
    "/api/v1/events": { post: operation("Ingest one metadata-only telemetry event", { security: bearer, tags: ["Telemetry"] }) },
    "/api/v1/events/batch": { post: operation("Atomically ingest telemetry events", { security: bearer, tags: ["Telemetry"] }) },
    "/api/v1/runs": { get: operation("List agent runs", { security: bearer, tags: ["Runs"] }), post: operation("Create an agent run receipt", { security: bearer, tags: ["Runs"] }) },
    "/api/v1/runs/{id}": { get: operation("Get a canonical agent run receipt", { security: bearer, tags: ["Runs"] }), patch: operation("Update a run", { security: bearer, tags: ["Runs"] }) },
    "/api/v1/usage": { get: operation("Get organization/project usage economics", { security: bearer, tags: ["Usage"] }) },
    "/api/v1/scenarios": { get: operation("List content-free saved economics scenarios", { security: session, tags: ["Economics"] }), post: operation("Save a metadata-only economics scenario", { security: session, tags: ["Economics"] }) },
    "/api/v1/scenarios/{id}": { get: operation("Get saved scenario", { security: session, tags: ["Economics"] }), patch: operation("Update or duplicate saved scenario", { security: session, tags: ["Economics"] }), delete: operation("Delete saved scenario", { security: session, tags: ["Economics"] }) },
    "/api/v1/scenario-comparisons": { get: operation("List scenario comparisons", { security: session, tags: ["Economics"] }), post: operation("Save economics comparison evidence", { security: session, tags: ["Economics"] }) },
    "/api/v1/provider-usage-imports": { get: operation("List provider usage imports", { security: session, tags: ["FinOps"] }), post: operation("Preview or commit provider CSV/JSON usage import", { security: session, tags: ["FinOps"] }) },
    "/api/v1/budgets": { get: operation("List budgets and policies", { security: bearer, tags: ["Control"] }), post: operation("Create budget or policy", { security: bearer, tags: ["Control"] }) },
    "/api/v1/budgets/check": { post: operation("Evaluate hierarchical policy/budget state", { security: bearer, tags: ["Control"] }) },
    "/api/v1/approvals": { get: operation("List policy approvals", { security: bearer, tags: ["Control"] }), post: operation("Request policy approval", { security: bearer, tags: ["Control"] }), patch: operation("Approve or deny pending policy request", { security: session, tags: ["Control"] }) },
    "/api/v1/provider-connections": { get: operation("List encrypted BYOK provider connections", { security: session, tags: ["Providers"] }), post: operation("Verify then connect provider credential", { security: session, tags: ["Providers"] }) },
    "/api/v1/provider-connections/{id}": { post: operation("Reverify provider credential", { security: session, tags: ["Providers"] }), patch: operation("Verify then rotate provider credential", { security: session, tags: ["Providers"] }), delete: operation("Delete provider connection", { security: session, tags: ["Providers"] }) },
    "/api/v1/settings/retention": { get: operation("Get metadata retention policy", { security: session, tags: ["Enterprise"] }), patch: operation("Update metadata retention policy", { security: session, tags: ["Enterprise"] }) },
    "/api/v1/settings/data-controls": { get: operation("Get privacy-mode and data-region truth state", { security: session, tags: ["Enterprise"] }), patch: operation("Update supported data controls", { security: session, tags: ["Enterprise"], description: "metadata_only is the active content posture; unavailable modes fail closed instead of becoming fake compliance settings." }) },
    "/api/v1/audit": { get: operation("List tenant-scoped audit events", { security: session, tags: ["Enterprise"] }) },
    "/api/v1/audit/export": { get: operation("Export tenant-scoped audit NDJSON", { security: session, tags: ["Enterprise"] }) },
    "/api/v1/alerts/endpoints": { get: operation("List signed alert destinations", { security: session, tags: ["Alerts"] }), post: operation("Create encrypted HTTPS alert destination", { security: session, tags: ["Alerts"] }) },
    "/api/v1/alerts/endpoints/{id}": { patch: operation("Enable or disable an alert destination", { security: session, tags: ["Alerts"] }), delete: operation("Delete alert destination", { security: session, tags: ["Alerts"] }) },
    "/api/v1/billing/checkout": { post: operation("Create hosted Stripe Checkout session", { security: session, tags: ["Billing"] }) },
    "/api/v1/billing/portal": { post: operation("Create Stripe Customer Portal session", { security: session, tags: ["Billing"] }) },
    "/api/gateway/{provider}": { post: operation("Execute governed OpenAI/Anthropic/Gemini request", { security: bearer, request: { $ref: "#/components/schemas/GatewayRequest" }, tags: ["Gateway"] }) },
    "/v1/responses": { post: operation("OpenAI Responses-compatible governed gateway", { security: bearer, request: { $ref: "#/components/schemas/ProviderCompatibleRequest" }, tags: ["Gateway"], description: "Requires x-ti-provider-connection-id and preserves provider-native response/streaming semantics while applying Token Intelligence governance." }) },
    "/v1/chat/completions": { post: operation("OpenAI Chat Completions-compatible governed gateway", { security: bearer, request: { $ref: "#/components/schemas/ProviderCompatibleRequest" }, tags: ["Gateway"] }) },
    "/v1/messages": { post: operation("Anthropic Messages-compatible governed gateway", { security: bearer, request: { $ref: "#/components/schemas/ProviderCompatibleRequest" }, tags: ["Gateway"] }) },
    "/mcp": { post: operation("MCP Streamable HTTP endpoint", { security: mcpSecurity, tags: ["MCP"], description: "Supports Token Intelligence API keys or WorkOS/AuthKit OAuth when configured. MCP budget checks are advisory; hard enforcement is gateway-only." }) },
  },
} as const;
