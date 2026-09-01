import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";
import { createTokenIntelligenceMcpServer } from "@/lib/mcp/server";
import type { ApiPrincipal } from "@/lib/auth/api-auth";
import { mcpTelemetryEventSchema, parseMcpTelemetryEvent } from "@/lib/telemetry/schemas";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(() => ({})),
  ingestTelemetryEvent: vi.fn(),
}));

vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/telemetry/ingest", () => ({ ingestTelemetryEvent: mocks.ingestTelemetryEvent }));

const principal: ApiPrincipal = {
  kind: "api_key",
  apiKeyId: "key_test_mcp",
  organizationId: "org_test_mcp",
  projectId: null,
  serviceAccountId: null,
  scopes: ["mcp:tools"],
};

const REQUIRED_TOOLS = [
  "estimate_cost",
  "compare_models",
  "recommend_model",
  "check_context",
  "check_budget",
  "record_usage",
  "get_usage",
  "get_project_spend",
  "get_run",
  "find_savings",
  "explain_cost",
].sort();

function handler() {
  return createMcpHandler(() => createTokenIntelligenceMcpServer(principal));
}

async function rpc(method: string, params: Record<string, unknown> = {}, id = 1) {
  const response = await handler().fetch(new Request("http://test.local/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }));
  const body = await response.text();
  const dataLines = body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
  const jsonText = dataLines.at(-1) ?? body;
  return { response, body, payload: jsonText ? JSON.parse(jsonText) : null };
}

describe("MCP production contract", () => {
  it("exposes the complete required tool surface", async () => {
    const result = await rpc("tools/list");
    expect(result.response.status).toBe(200);
    expect(result.payload.error).toBeUndefined();
    const names = (result.payload.result?.tools ?? []).map((tool: { name: string }) => tool.name).sort();
    expect(names).toEqual(REQUIRED_TOOLS);
  });

  it("executes a metadata-only economics tool without a database round trip", async () => {
    const result = await rpc("tools/call", {
      name: "estimate_cost",
      arguments: { inputTokens: 1_000, outputTokens: 100, cachedInputTokens: 0 },
    });
    expect(result.response.status).toBe(200);
    expect(result.payload.error).toBeUndefined();
    const text = result.payload.result?.content?.[0]?.text;
    expect(typeof text).toBe("string");
    const parsed = JSON.parse(text);
    expect(parsed.source).toBe("current_pricing_catalog");
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  it("returns a JSON-RPC error for an unknown tool", async () => {
    const result = await rpc("tools/call", { name: "not_a_real_tool", arguments: {} });
    expect(result.response.status).toBe(200);
    expect(result.payload.error ?? result.payload.result?.isError).toBeTruthy();
  });

  it("rejects malformed JSON at the transport boundary", async () => {
    const response = await handler().fetch(new Request("http://test.local/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: "{not-json",
    }));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("uses JSON-safe tool schemas and converts ISO datetimes at the MCP application boundary", () => {
    expect(() => z.toJSONSchema(mcpTelemetryEventSchema)).not.toThrow();
    const wireSchema = z.toJSONSchema(mcpTelemetryEventSchema);
    expect(JSON.stringify(wireSchema)).not.toContain('"type":"date"');

    const event = parseMcpTelemetryEvent({
      sourceEventId: "mcp-event-001",
      source: "mcp",
      eventType: "run.upsert",
      occurredAt: "2026-09-01T15:42:13.123Z",
      payload: {},
    });
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.occurredAt.toISOString()).toBe("2026-09-01T15:42:13.123Z");
  });

  it("accepts an ISO datetime through record_usage and passes a Date to ingestion", async () => {
    mocks.ingestTelemetryEvent.mockResolvedValueOnce({ sourceEventId: "mcp-event-002", duplicate: false });
    const result = await rpc("tools/call", {
      name: "record_usage",
      arguments: {
        sourceEventId: "mcp-event-002",
        source: "mcp",
        eventType: "run.upsert",
        occurredAt: "2026-09-01T15:42:13.123Z",
        payload: {},
      },
    });
    expect(result.payload.error).toBeUndefined();
    const event = mocks.ingestTelemetryEvent.mock.calls.at(-1)?.[2];
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.occurredAt.toISOString()).toBe("2026-09-01T15:42:13.123Z");
  });
});
