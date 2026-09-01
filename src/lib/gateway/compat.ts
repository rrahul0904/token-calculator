import * as z from "zod";
import type { GatewayApiSurface } from "@/lib/gateway/providers";

const providerBodySchema = z.record(z.string(), z.unknown()).refine((body) => typeof body.model === "string" && body.model.length > 0, "model is required");

export interface CompatibilityTarget {
  provider: "openai" | "anthropic";
  surface: Extract<GatewayApiSurface, "responses" | "chat_completions" | "messages">;
}

function boundedHeader(request: Request, name: string, max = 180) {
  const value = request.headers.get(name)?.trim();
  return value && value.length <= max ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 1_000_000 ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 2 ? value : undefined;
}

function metadataFromHeaders(request: Request) {
  const metadata: Record<string, string> = { compatibility_surface: request.headers.get("x-ti-compat-surface") ?? "provider_compatible" };
  const client = boundedHeader(request, "x-ti-client", 120);
  if (client) metadata.client = client;
  return metadata;
}

export function normalizeCompatibilityRequest(request: Request, rawBody: unknown, target: CompatibilityTarget) {
  const parsed = providerBodySchema.safeParse(rawBody);
  if (!parsed.success) return { ok: false as const, status: 400, error: "INVALID_PROVIDER_REQUEST", issues: parsed.error.issues };
  const body = parsed.data;
  const providerConnectionId = boundedHeader(request, "x-ti-provider-connection-id");
  if (!providerConnectionId || providerConnectionId.length < 8) {
    return { ok: false as const, status: 400, error: "TI_PROVIDER_CONNECTION_REQUIRED", detail: "Send x-ti-provider-connection-id for the encrypted BYOK connection to use." };
  }

  const maxOutputTokens = target.surface === "responses"
    ? positiveInteger(body.max_output_tokens)
    : target.surface === "chat_completions"
      ? positiveInteger(body.max_completion_tokens) ?? positiveInteger(body.max_tokens)
      : positiveInteger(body.max_tokens);
  const input = target.surface === "responses" ? body.input : body.messages;
  if (input === undefined) return { ok: false as const, status: 400, error: "INVALID_PROVIDER_REQUEST", detail: target.surface === "responses" ? "input is required" : "messages is required" };

  return {
    ok: true as const,
    body: {
      providerConnectionId,
      projectId: boundedHeader(request, "x-ti-project-id") ?? null,
      runId: boundedHeader(request, "x-ti-run-id"),
      agentName: boundedHeader(request, "x-ti-agent-name", 120) ?? "Provider-compatible gateway",
      workflowName: boundedHeader(request, "x-ti-workflow-name", 160) ?? null,
      environment: boundedHeader(request, "x-ti-environment", 80) ?? "production",
      model: String(body.model),
      fallbackModel: boundedHeader(request, "x-ti-fallback-model", 200),
      input: {
        __ti_compat_surface: target.surface,
        __ti_compat_body: body,
      },
      maxOutputTokens,
      stream: body.stream === true,
      temperature: finiteNumber(body.temperature),
      metadata: metadataFromHeaders(request),
    },
  };
}

export function asInternalGatewayRequest(original: Request, normalizedBody: Record<string, unknown>) {
  const headers = new Headers(original.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(original.url, {
    method: "POST",
    headers,
    body: JSON.stringify(normalizedBody),
    signal: original.signal,
  });
}
