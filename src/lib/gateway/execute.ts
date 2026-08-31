import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb } from "@/db/client";
import { llmCalls, organizations, projects, providerConnections, runs } from "@/db/schema";
import type { ApiPrincipal } from "@/lib/auth/api-auth";
import { calculateCost } from "@/lib/cost";
import { MODEL_CATALOG } from "@/lib/models";
import { evaluateOrganizationPolicy } from "@/lib/policy/evaluate-db";
import { decryptSecret } from "@/lib/security/vault";
import { parseSseUsage, providerForName, type GatewayProviderAdapter, type GatewayRequest, type GatewayUsage } from "@/lib/gateway/providers";

export const gatewayRequestSchema = z.object({
  providerConnectionId: z.string().min(8).max(180),
  projectId: z.string().max(180).nullable().optional(),
  runId: z.string().min(8).max(180).optional(),
  agentName: z.string().trim().min(1).max(120).default("API Gateway"),
  workflowName: z.string().trim().max(160).nullable().optional(),
  environment: z.string().trim().min(1).max(80).default("production"),
  model: z.string().trim().min(1).max(200),
  input: z.unknown(),
  maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
  stream: z.boolean().default(false),
  temperature: z.number().min(0).max(2).optional(),
  metadata: z.record(z.string(), z.string()).max(20).optional(),
});

export type GovernedGatewayRequest = z.infer<typeof gatewayRequestSchema>;

export interface GatewayExecutionResult {
  response: Response;
  runId: string;
  callId: string | null;
  policyAction: string;
}

function providerCatalogName(provider: string) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "gemini") return "Google";
  return null;
}

function estimateTokens(input: unknown): number {
  const serialized = typeof input === "string" ? input : JSON.stringify(input);
  return Math.max(1, Math.ceil(Buffer.byteLength(serialized, "utf8") / 4));
}

function findCatalogModel(provider: string, model: string) {
  const catalogProvider = providerCatalogName(provider);
  return MODEL_CATALOG.find((entry) => entry.id === model && entry.provider === catalogProvider) ?? null;
}

function costForUsage(provider: string, model: string, usage: GatewayUsage): number | null {
  const catalog = findCatalogModel(provider, model);
  if (!catalog) return null;
  const fresh = usage.freshInputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  if ([usage.freshInputTokens, usage.cacheReadTokens, usage.cacheWriteTokens, usage.outputTokens].every((value) => value === null)) return null;
  return calculateCost(catalog, {
    inputTokens: fresh + cacheRead,
    cachedInputTokens: cacheRead,
    cacheWrite5mTokens: cacheWrite,
    outputTokens: output,
  }).total;
}

async function assertProject(principal: ApiPrincipal, projectId: string | null): Promise<string | null> {
  const resolved = principal.projectId ?? projectId;
  if (principal.projectId && projectId && principal.projectId !== projectId) throw new Error("PROJECT_SCOPE_VIOLATION");
  if (!resolved) return null;
  const rows = await getDb().select({ id: projects.id }).from(projects).where(and(eq(projects.id, resolved), eq(projects.organizationId, principal.organizationId))).limit(1);
  if (!rows[0]) throw new Error("PROJECT_NOT_FOUND");
  return resolved;
}

async function persistCall(args: {
  organizationId: string;
  runId: string;
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  providerRequestId: string | null;
  statusCode: number;
  startedAt: Date;
  endedAt: Date;
  latencyMs: number;
  ttftMs: number | null;
  usage: GatewayUsage;
  costUsd: number | null;
  attemptIndex: number;
}) {
  const callId = `llm_${randomUUID()}`;
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(llmCalls).values({
      id: callId,
      organizationId: args.organizationId,
      runId: args.runId,
      provider: args.provider,
      modelRequested: args.requestedModel,
      modelResolved: args.resolvedModel,
      providerRequestId: args.providerRequestId,
      freshInputTokens: args.usage.freshInputTokens,
      cacheReadTokens: args.usage.cacheReadTokens,
      cacheWriteTokens: args.usage.cacheWriteTokens,
      reasoningTokens: args.usage.reasoningTokens,
      outputTokens: args.usage.outputTokens,
      costUsd: args.costUsd === null ? null : args.costUsd.toString(),
      costSource: args.costUsd === null ? "provider_measured" : "reconciled",
      pricingVersion: findCatalogModel(args.provider, args.resolvedModel)?.verifiedAt ?? null,
      latencyMs: args.latencyMs,
      timeToFirstTokenMs: args.ttftMs,
      statusCode: args.statusCode,
      attemptIndex: args.attemptIndex,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      metadata: { contentStored: false, gateway: true },
    });

    const terminalStatus = args.statusCode >= 200 && args.statusCode < 400 ? "completed" : "failed";
    await tx.update(runs).set({
      endedAt: args.endedAt,
      status: terminalStatus,
      terminationReason: terminalStatus === "failed" ? `provider_http_${args.statusCode}` : null,
      actualCostUsd: args.costUsd === null ? null : args.costUsd.toString(),
      reconciledCostUsd: args.costUsd === null ? null : args.costUsd.toString(),
      freshInputTokens: args.usage.freshInputTokens ?? 0,
      cacheReadTokens: args.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: args.usage.cacheWriteTokens ?? 0,
      reasoningTokens: args.usage.reasoningTokens ?? 0,
      outputTokens: args.usage.outputTokens ?? 0,
      turnCount: 1,
      usageSource: "provider_measured",
      updatedAt: args.endedAt,
    }).where(and(eq(runs.id, args.runId), eq(runs.organizationId, args.organizationId)));
  });
  return callId;
}

function retryDelay(attempt: number): number {
  const base = Math.min(250 * (2 ** attempt), 2_000);
  return base + Math.floor(Math.random() * 150);
}

async function fetchWithBoundedRetry(adapter: GatewayProviderAdapter, request: GatewayRequest, credential: string) {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const upstream = adapter.buildRequest(request, credential);
    last = await fetch(upstream.url, { ...upstream.init, signal: AbortSignal.timeout(120_000), cache: "no-store" });
    if (!adapter.retryable(last.status) || attempt === 2) return { response: last, attemptIndex: attempt };
    await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
  }
  throw new Error("GATEWAY_RETRY_EXHAUSTED");
}

export async function executeGovernedGateway(principal: ApiPrincipal, input: GovernedGatewayRequest): Promise<GatewayExecutionResult> {
  const db = getDb();
  const orgRows = await db.select({ plan: organizations.plan }).from(organizations).where(eq(organizations.id, principal.organizationId)).limit(1);
  if (!orgRows[0]) throw new Error("ORGANIZATION_NOT_FOUND");
  if (orgRows[0].plan !== "enterprise") throw new Error("GATEWAY_ENTITLEMENT_REQUIRED");

  const projectId = await assertProject(principal, input.projectId ?? null);
  const connectionRows = await db.select().from(providerConnections).where(and(
    eq(providerConnections.id, input.providerConnectionId),
    eq(providerConnections.organizationId, principal.organizationId),
  )).limit(1);
  const connection = connectionRows[0];
  if (!connection) throw new Error("PROVIDER_CONNECTION_NOT_FOUND");
  if (!['openai', 'anthropic', 'gemini'].includes(connection.provider)) throw new Error("PROVIDER_UNSUPPORTED");
  const adapter = providerForName(connection.provider);
  if (!adapter) throw new Error("PROVIDER_UNSUPPORTED");

  const runId = input.runId ?? `run_${randomUUID()}`;
  const startedAt = new Date();
  const estimatedInputTokens = estimateTokens(input.input);
  const model = findCatalogModel(connection.provider, input.model);
  const estimatedOutput = input.maxOutputTokens ?? Math.min(model?.maxOutput ?? 4096, 4096);
  const estimatedCost = model ? calculateCost(model, { inputTokens: estimatedInputTokens, outputTokens: estimatedOutput }).total : null;

  await db.insert(runs).values({
    id: runId,
    organizationId: principal.organizationId,
    projectId,
    serviceAccountId: principal.serviceAccountId,
    environment: input.environment,
    agentName: input.agentName,
    agentVendor: connection.provider,
    workflowName: input.workflowName ?? null,
    startedAt,
    status: "queued",
    estimatedCostUsd: estimatedCost === null ? null : estimatedCost.toString(),
    freshInputTokens: estimatedInputTokens,
    usageSource: "estimated",
    metadata: { gateway: true, contentStored: false, providerConnectionId: connection.id, estimatedInputMethod: "utf8_bytes_div_4" },
  });

  const policy = await evaluateOrganizationPolicy(principal.organizationId, {
    projectId,
    environment: input.environment,
    serviceAccountId: principal.serviceAccountId ?? undefined,
    apiKeyId: principal.apiKeyId,
    agent: input.agentName,
    workflow: input.workflowName ?? undefined,
    runId,
    observedCostUsd: 0,
    projectedNextCallCostUsd: estimatedCost ?? undefined,
    tokens: 0,
    turns: 0,
    retries: 0,
    failedToolCalls: 0,
    toolCalls: 0,
    provider: connection.provider,
    model: input.model,
    isFallback: false,
  });

  if (policy.enforcement !== "continue") {
    const endedAt = new Date();
    await db.update(runs).set({ status: "budget_blocked", endedAt, terminationReason: policy.decision.action, updatedAt: endedAt }).where(eq(runs.id, runId));
    return {
      runId,
      callId: null,
      policyAction: policy.decision.action,
      response: Response.json({ error: "GATEWAY_POLICY_BLOCKED", action: policy.decision.action, reason: policy.decision.reason, runId }, { status: policy.enforcement === "await_approval" ? 409 : 402, headers: { "Cache-Control": "no-store", "x-ti-run-id": runId } }),
    };
  }

  const credential = decryptSecret(connection.encryptedCredential, `${principal.organizationId}:${connection.provider}:${connection.id}`);
  await db.update(runs).set({ status: "running", updatedAt: new Date() }).where(eq(runs.id, runId));

  const request: GatewayRequest = {
    model: input.model,
    input: input.input,
    maxOutputTokens: input.maxOutputTokens,
    stream: input.stream,
    temperature: input.temperature,
    metadata: input.metadata,
  };
  const upstreamStarted = Date.now();
  const { response: upstreamResponse, attemptIndex } = await fetchWithBoundedRetry(adapter, request, credential);
  const latencyAtHeaders = Date.now() - upstreamStarted;
  const baseHeaders = new Headers(upstreamResponse.headers);
  baseHeaders.set("Cache-Control", "no-store");
  baseHeaders.set("x-ti-run-id", runId);
  baseHeaders.set("x-ti-policy-action", policy.decision.action);
  baseHeaders.delete("content-length");

  if (input.stream && upstreamResponse.body) {
    const decoder = new TextDecoder();
    let buffered = "";
    let firstChunkAt: number | null = null;
    const providerRequestId = upstreamResponse.headers.get("x-request-id") ?? upstreamResponse.headers.get("request-id") ?? upstreamResponse.headers.get("x-goog-request-id");
    const transformed = upstreamResponse.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      async transform(chunk, controller) {
        if (firstChunkAt === null) firstChunkAt = Date.now();
        if (buffered.length < 4_000_000) buffered += decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      async flush() {
        buffered += decoder.decode();
        const usage = parseSseUsage(adapter, buffered);
        const endedAt = new Date();
        const resolvedModel = input.model;
        const cost = costForUsage(connection.provider, resolvedModel, usage);
        await persistCall({
          organizationId: principal.organizationId,
          runId,
          provider: connection.provider,
          requestedModel: input.model,
          resolvedModel,
          providerRequestId,
          statusCode: upstreamResponse.status,
          startedAt: new Date(upstreamStarted),
          endedAt,
          latencyMs: endedAt.getTime() - upstreamStarted,
          ttftMs: firstChunkAt === null ? null : firstChunkAt - upstreamStarted,
          usage,
          costUsd: cost,
          attemptIndex,
        });
      },
    }));
    return { runId, callId: null, policyAction: policy.decision.action, response: new Response(transformed, { status: upstreamResponse.status, headers: baseHeaders }) };
  }

  const rawText = await upstreamResponse.text();
  let payload: unknown = null;
  try { payload = rawText ? JSON.parse(rawText) : null; } catch { payload = null; }
  const endedAt = new Date();
  const usage = payload === null ? { freshInputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, outputTokens: null, totalTokens: null } : adapter.normalizeUsage(payload);
  const resolvedModel = payload === null ? input.model : adapter.resolvedModel(payload, input.model);
  const providerRequestId = payload === null ? null : adapter.providerRequestId(payload, upstreamResponse);
  const cost = costForUsage(connection.provider, resolvedModel, usage);
  const callId = await persistCall({
    organizationId: principal.organizationId,
    runId,
    provider: connection.provider,
    requestedModel: input.model,
    resolvedModel,
    providerRequestId,
    statusCode: upstreamResponse.status,
    startedAt: new Date(upstreamStarted),
    endedAt,
    latencyMs: endedAt.getTime() - upstreamStarted,
    ttftMs: latencyAtHeaders,
    usage,
    costUsd: cost,
    attemptIndex,
  });

  baseHeaders.set("x-ti-call-id", callId);
  baseHeaders.set("x-ti-usage-source", "provider_measured");
  if (cost !== null) baseHeaders.set("x-ti-reconciled-cost-usd", cost.toFixed(8));
  const contentType = upstreamResponse.headers.get("content-type") ?? "application/json";
  baseHeaders.set("content-type", contentType);
  return { runId, callId, policyAction: policy.decision.action, response: new Response(rawText, { status: upstreamResponse.status, headers: baseHeaders }) };
}
