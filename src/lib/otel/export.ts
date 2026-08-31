import { randomBytes } from "node:crypto";
import type { GatewayUsage } from "@/lib/gateway/providers";

export interface GatewayTraceEvent {
  runId: string;
  projectId: string | null;
  agentName: string;
  workflowName: string | null;
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  providerRequestId: string | null;
  startedAt: Date;
  endedAt: Date;
  statusCode: number;
  latencyMs: number;
  ttftMs: number | null;
  attemptIndex: number;
  fallbackUsed: boolean;
  policyAction: string;
  usage: GatewayUsage;
  costUsd: number | null;
}

function parseHeaders(value: string | undefined): Record<string, string> {
  if (!value) return {};
  const headers: Record<string, string> = {};
  for (const part of value.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    if (key) headers[key] = raw;
  }
  return headers;
}

function endpoint(): string | null {
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/$/, "");
  if (!base) return null;
  return base.endsWith("/v1/traces") ? base : `${base}/v1/traces`;
}

function attribute(key: string, value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return { key, value: { intValue: Number.isInteger(value) ? String(value) : undefined, doubleValue: Number.isInteger(value) ? undefined : value } };
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  return { key, value: { stringValue: value } };
}

export async function exportGatewayTrace(event: GatewayTraceEvent): Promise<"sent" | "not_configured" | "failed"> {
  const url = endpoint();
  if (!url) return "not_configured";

  const inputTokens = event.usage.freshInputTokens === null && event.usage.cacheReadTokens === null && event.usage.cacheWriteTokens === null
    ? null
    : (event.usage.freshInputTokens ?? 0) + (event.usage.cacheReadTokens ?? 0) + (event.usage.cacheWriteTokens ?? 0);
  const outputTokens = event.usage.outputTokens === null && event.usage.reasoningTokens === null
    ? null
    : (event.usage.outputTokens ?? 0) + (event.usage.reasoningTokens ?? 0);
  const attrs = [
    attribute("gen_ai.operation.name", "chat"),
    attribute("gen_ai.provider.name", event.provider === "gemini" ? "gcp.gen_ai" : event.provider),
    attribute("gen_ai.request.model", event.requestedModel),
    attribute("gen_ai.response.model", event.resolvedModel),
    attribute("gen_ai.response.id", event.providerRequestId),
    attribute("gen_ai.usage.input_tokens", inputTokens),
    attribute("gen_ai.usage.cache_read.input_tokens", event.usage.cacheReadTokens),
    attribute("gen_ai.usage.cache_creation.input_tokens", event.usage.cacheWriteTokens),
    attribute("gen_ai.usage.output_tokens", outputTokens),
    attribute("gen_ai.usage.reasoning.output_tokens", event.usage.reasoningTokens),
    attribute("gen_ai.workflow.name", event.workflowName),
    attribute("token_intelligence.run.id", event.runId),
    attribute("token_intelligence.project.id", event.projectId),
    attribute("token_intelligence.agent.name", event.agentName),
    attribute("token_intelligence.cost.usd", event.costUsd),
    attribute("token_intelligence.policy.action", event.policyAction),
    attribute("token_intelligence.gateway.attempt", event.attemptIndex),
    attribute("token_intelligence.gateway.fallback", event.fallbackUsed),
    attribute("http.response.status_code", event.statusCode),
    attribute("server.request.duration_ms", event.latencyMs),
    attribute("gen_ai.response.time_to_first_token_ms", event.ttftMs),
  ].filter(Boolean);

  const payload = {
    resourceSpans: [{
      resource: { attributes: [attribute("service.name", "token-intelligence")].filter(Boolean) },
      scopeSpans: [{
        scope: { name: "token-intelligence.gateway", version: "1" },
        spans: [{
          traceId: randomBytes(16).toString("hex"),
          spanId: randomBytes(8).toString("hex"),
          name: `chat ${event.resolvedModel}`,
          kind: 3,
          startTimeUnixNano: String(BigInt(event.startedAt.getTime()) * 1_000_000n),
          endTimeUnixNano: String(BigInt(event.endedAt.getTime()) * 1_000_000n),
          attributes: attrs,
          status: { code: event.statusCode >= 200 && event.statusCode < 400 ? 1 : 2 },
        }],
      }],
    }],
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
