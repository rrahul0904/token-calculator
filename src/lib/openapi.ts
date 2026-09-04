import { getPublicSiteUrl } from "@/lib/site-url";
const json = { "application/json": { schema: { type: "object" } } };
const noContent = { description: "Success" };
const bearer = [{ bearerAuth: [] }];
const session = [{ cookieAuth: [] }];

function operation(summary: string, options: { security?: object[]; request?: object; tags?: string[] } = {}) {
  return {
    summary,
    tags: options.tags,
    security: options.security,
    requestBody: options.request ? { required: true, content: { "application/json": { schema: options.request } } } : undefined,
    responses: { "200": noContent, "400": { description: "Invalid request" }, "401": { description: "Unauthorized" }, "403": { description: "Forbidden" }, "429": { description: "Quota/rate limit exceeded" }, "503": { description: "Required service not configured or unavailable" } },
  };
}

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "Token Intelligence API",
    version: "1.0.0",
    description: "AI economics, agent-run telemetry, budgets, model economics, MCP-adjacent data and governed provider gateway APIs. Measurement provenance is preserved as provider_measured, agent_measured, local_tokenizer_reference, estimated, or reconciled. Prompt/code content is not persisted by default.",
  },
  servers: [{ url: getPublicSiteUrl() }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Token Intelligence API key" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "wos-session", description: "WorkOS AuthKit session cookie for browser/session routes." },
    },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
      UsageSource: { type: "string", enum: ["provider_measured", "agent_measured", "local_tokenizer_reference", "estimated", "reconciled"] },
      TokenizeRequest: { type: "object", properties: { text: { type: "string", maxLength: 500000 }, model: { type: "string", description: "Optional Token Intelligence model ID used to select a tokenizer family." }, includePieces: { type: "boolean", default: false }, maxPieces: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, required: ["text"] },
      EstimateRequest: { type: "object", properties: { inputTokens: { type: "integer", minimum: 0 }, outputTokens: { type: "integer", minimum: 0 }, cachedInputTokens: { type: "integer", minimum: 0 }, requestsPerMonth: { type: "integer", minimum: 1 } }, required: ["inputTokens", "outputTokens"] },
      GatewayRequest: { type: "object", properties: { providerConnectionId: { type: "string" }, projectId: { type: ["string", "null"] }, runId: { type: "string" }, agentName: { type: "string" }, workflowName: { type: ["string", "null"] }, environment: { type: "string" }, model: { type: "string" }, fallbackModel: { type: "string" }, input: {}, maxOutputTokens: { type: "integer" }, stream: { type: "boolean" } }, required: ["providerConnectionId", "model", "input"] },
    },
  },
  paths: {
    "/api/health": { get: operation("Deployment health", { tags: ["Operations"] }) },
    "/api/v1/tokenize": { post: operation("Tokenize text without persistence", { request: { $ref: "#/components/schemas/TokenizeRequest" }, tags: ["Economics"] }) },
    "/api/v1/models": { get: operation("List model catalog and pricing provenance", { tags: ["Economics"] }) },
    "/api/v1/estimate": { post: operation("Estimate model costs", { request: { $ref: "#/components/schemas/EstimateRequest" }, tags: ["Economics"] }) },
    "/api/v1/compare": { post: operation("Compare model economics", { tags: ["Economics"] }) },
    "/api/v1/recommend": { post: operation("Recommend economically compatible models", { tags: ["Economics"] }) },
    "/api/v1/events": { post: operation("Ingest one metadata-only telemetry event", { security: bearer, tags: ["Telemetry"] }) },
    "/api/v1/events/batch": { post: operation("Atomically ingest telemetry events", { security: bearer, tags: ["Telemetry"] }) },
    "/api/v1/runs": { get: operation("List agent runs", { security: bearer, tags: ["Runs"] }), post: operation("Create an agent run receipt", { security: bearer, tags: ["Runs"] }) },
    "/api/v1/runs/{id}": { get: operation("Get a canonical agent run receipt", { security: bearer, tags: ["Runs"] }), patch: operation("Update a run", { security: bearer, tags: ["Runs"] }) },
    "/api/v1/usage": { get: operation("Get organization/project usage economics", { security: bearer, tags: ["Usage"] }) },
    "/api/v1/projects": { get: operation("List projects", { security: session, tags: ["Projects"] }), post: operation("Create a project", { security: session, tags: ["Projects"] }) },
    "/api/v1/projects/{id}": { get: operation("Get project detail", { security: session, tags: ["Projects"] }), patch: operation("Edit/archive/restore project", { security: session, tags: ["Projects"] }) },
    "/api/v1/budgets": { get: operation("List budgets and policies", { security: bearer, tags: ["Control"] }), post: operation("Create budget or policy", { security: bearer, tags: ["Control"] }) },
    "/api/v1/budgets/check": { post: operation("Evaluate hierarchical policy/budget state", { security: bearer, tags: ["Control"] }) },
    "/api/v1/api-keys": { get: operation("List API keys without secret material", { security: session, tags: ["Identity"] }), post: operation("Create an API key; secret returned once", { security: session, tags: ["Identity"] }) },
    "/api/v1/api-keys/{id}": { patch: operation("Rotate an API key; new secret returned once", { security: session, tags: ["Identity"] }), delete: operation("Revoke an API key", { security: session, tags: ["Identity"] }) },
    "/api/v1/api-keys/{id}/quota": { get: operation("Get API-key quota", { security: session, tags: ["Control"] }), patch: operation("Set API-key quota", { security: session, tags: ["Control"] }) },
    "/api/v1/provider-connections": { get: operation("List encrypted BYOK provider connections", { security: session, tags: ["Providers"] }), post: operation("Verify then connect provider credential", { security: session, tags: ["Providers"] }) },
    "/api/v1/provider-connections/{id}": { post: operation("Reverify provider credential", { security: session, tags: ["Providers"] }), patch: operation("Verify then rotate provider credential", { security: session, tags: ["Providers"] }), delete: operation("Delete provider connection", { security: session, tags: ["Providers"] }) },
    "/api/v1/service-accounts": { get: operation("List service accounts", { security: session, tags: ["Identity"] }), post: operation("Create service account", { security: session, tags: ["Identity"] }) },
    "/api/v1/service-accounts/{id}": { delete: operation("Revoke service account and its keys", { security: session, tags: ["Identity"] }) },
    "/api/v1/members/{id}": { patch: operation("Change organization role with last-owner protection", { security: session, tags: ["Identity"] }), delete: operation("Remove organization member with last-owner protection", { security: session, tags: ["Identity"] }) },
    "/api/v1/audit/export": { get: operation("Export tenant-scoped audit NDJSON", { security: session, tags: ["Enterprise"] }) },
    "/api/v1/alerts/endpoints": { get: operation("List signed alert destinations", { security: session, tags: ["Alerts"] }), post: operation("Create encrypted HTTPS alert destination", { security: session, tags: ["Alerts"] }) },
    "/api/v1/alerts/endpoints/{id}": { patch: operation("Enable or disable an alert destination", { security: session, tags: ["Alerts"] }), delete: operation("Delete alert destination", { security: session, tags: ["Alerts"] }) },
    "/api/gateway/{provider}": { post: operation("Execute a governed OpenAI/Anthropic/Gemini request", { security: bearer, request: { $ref: "#/components/schemas/GatewayRequest" }, tags: ["Gateway"] }) },
    "/mcp": { post: operation("Authenticated MCP Streamable HTTP endpoint", { security: bearer, tags: ["MCP"] }) },
  },
} as const;
