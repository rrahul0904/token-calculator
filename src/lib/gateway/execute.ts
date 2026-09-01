import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { getDb } from "@/db/client";
import { llmCalls, organizations, projects, providerConnections, runs } from "@/db/schema";
import type { ApiPrincipal } from "@/lib/auth/api-auth";
import { calculateCost } from "@/lib/cost";
import { decryptProviderCredential } from "@/lib/gateway/provider-credential";
import type { GatewayProviderName } from "@/lib/gateway/provider-connectivity";
import { parseSseUsage, providerForName, type GatewayProviderAdapter, type GatewayRequest, type GatewayUsage } from "@/lib/gateway/providers";
import { MODEL_CATALOG } from "@/lib/models";
import { exportGatewayTrace } from "@/lib/otel/export";
import { evaluateOrganizationPolicy } from "@/lib/policy/evaluate-db";

const metadataSchema = z.record(z.string(), z.string()).refine((value) => Object.keys(value).length <= 20, "At most 20 metadata entries are allowed.");
const contentSchema = z.unknown().refine((value) => value !== undefined, "input is required");

export const gatewayRequestSchema = z.object({
  providerConnectionId: z.string().min(8).max(180),
  projectId: z.string().max(180).nullable().optional(),
  runId: z.string().min(8).max(180).optional(),
  agentName: z.string().trim().min(1).max(120).default("API Gateway"),
  workflowName: z.string().trim().max(160).nullable().optional(),
  environment: z.string().trim().min(1).max(80).default("production"),
  model: z.string().trim().min(1).max(200),
  fallbackModel: z.string().trim().min(1).max(200).optional(),
  input: contentSchema,
  maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
  stream: z.boolean().default(false),
  temperature: z.number().min(0).max(2).optional(),
  metadata: metadataSchema.optional(),
});

export type GovernedGatewayRequest = z.infer<typeof gatewayRequestSchema>;

export interface GatewayExecutionResult {
  response: Response;
  runId: string;
  callId: string | null;
  policyAction: string;
}

type RetryAttempt = {
  attemptIndex: number;
  statusCode: number | null;
  startedAt: Date;
  endedAt: Date;
  providerRequestId: string | null;
  reason: string;
  delayMs: number | null;
};

type PolicyResult = Awaited<ReturnType<typeof evaluateOrganizationPolicy>>;
type ProviderAttemptResult =
  | { kind: "response"; response: Response; attemptIndex: number; retryCount: number; unknownPriorCharge: boolean; policy: PolicyResult }
  | { kind: "blocked"; policy: PolicyResult; retryCount: number; unknownPriorCharge: boolean; lastAttemptId: string | null };

const EMPTY_USAGE: GatewayUsage = {
  freshInputTokens: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  reasoningTokens: null,
  outputTokens: null,
  totalTokens: null,
};

function providerCatalogName(provider: string) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "gemini") return "Google";
  return null;
}

function estimateTokens(input: unknown): number {
  const serialized = typeof input === "string" ? input : JSON.stringify(input) ?? "null";
  return Math.max(1, Math.ceil(Buffer.byteLength(serialized, "utf8") / 4));
}

function findCatalogModel(provider: string, model: string) {
  const catalogProvider = providerCatalogName(provider);
  return MODEL_CATALOG.find((entry) => entry.id === model && entry.provider === catalogProvider) ?? null;
}

function estimateModelCost(provider: string, model: string, inputTokens: number, maxOutputTokens?: number): number | null {
  const catalog = findCatalogModel(provider, model);
  if (!catalog) return null;
  const output = maxOutputTokens ?? Math.min(catalog.maxOutput ?? 4096, 4096);
  return calculateCost(catalog, { inputTokens, outputTokens: output }).total;
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

function providerRequestId(response: Response): string | null {
  return response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? response.headers.get("x-goog-request-id");
}

async function assertProject(principal: ApiPrincipal, projectId: string | null): Promise<string | null> {
  const resolved = principal.projectId ?? projectId;
  if (principal.projectId && projectId && principal.projectId !== projectId) throw new Error("PROJECT_SCOPE_VIOLATION");
  if (!resolved) return null;
  const rows = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, resolved), eq(projects.organizationId, principal.organizationId)))
    .limit(1);
  if (!rows[0]) throw new Error("PROJECT_NOT_FOUND");
  return resolved;
}

async function ensureRun(args: {
  runId: string;
  organizationId: string;
  projectId: string | null;
  serviceAccountId: string | null;
  apiKeyId: string;
  input: GovernedGatewayRequest;
  provider: string;
  estimatedInputTokens: number;
  estimatedCost: number | null;
  startedAt: Date;
}) {
  const db = getDb();
  const existing = await db.select({ id: runs.id, organizationId: runs.organizationId }).from(runs).where(eq(runs.id, args.runId)).limit(1);
  if (existing[0] && existing[0].organizationId !== args.organizationId) throw new Error("RUN_SCOPE_VIOLATION");
  if (existing[0]) {
    await db.update(runs).set({
      projectId: args.projectId,
      serviceAccountId: args.serviceAccountId,
      environment: args.input.environment,
      agentName: args.input.agentName,
      agentVendor: args.provider,
      workflowName: args.input.workflowName ?? null,
      status: "queued",
      estimatedCostUsd: args.estimatedCost === null ? null : args.estimatedCost.toString(),
      updatedAt: args.startedAt,
    }).where(and(eq(runs.id, args.runId), eq(runs.organizationId, args.organizationId)));
    return;
  }
  await db.insert(runs).values({
    id: args.runId,
    organizationId: args.organizationId,
    projectId: args.projectId,
    serviceAccountId: args.serviceAccountId,
    environment: args.input.environment,
    agentName: args.input.agentName,
    agentVendor: args.provider,
    workflowName: args.input.workflowName ?? null,
    startedAt: args.startedAt,
    status: "queued",
    estimatedCostUsd: args.estimatedCost === null ? null : args.estimatedCost.toString(),
    freshInputTokens: args.estimatedInputTokens,
    usageSource: "estimated",
    metadata: {
      gateway: true,
      contentStored: false,
      providerConnectionId: args.input.providerConnectionId,
      apiKeyId: args.apiKeyId,
      estimatedInputMethod: "utf8_bytes_div_4",
    },
  });
}

async function persistAttempt(args: {
  organizationId: string;
  runId: string;
  provider: string;
  model: string;
  attempt: RetryAttempt;
  fallbackFromCallId?: string | null;
}) {
  const id = `llm_${randomUUID()}`;
  await getDb().insert(llmCalls).values({
    id,
    organizationId: args.organizationId,
    runId: args.runId,
    provider: args.provider,
    modelRequested: args.model,
    modelResolved: args.model,
    providerRequestId: args.attempt.providerRequestId,
    costUsd: null,
    costSource: "unknown",
    statusCode: args.attempt.statusCode,
    attemptIndex: args.attempt.attemptIndex,
    fallbackFromCallId: args.fallbackFromCallId ?? null,
    startedAt: args.attempt.startedAt,
    endedAt: args.attempt.endedAt,
    latencyMs: args.attempt.endedAt.getTime() - args.attempt.startedAt.getTime(),
    metadata: {
      contentStored: false,
      gateway: true,
      retryAttempt: true,
      chargeUnknown: true,
      retryReason: args.attempt.reason,
      retryDelayMs: args.attempt.delayMs,
    },
  });
  return id;
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
  retryCount: number;
  fallbackFromCallId?: string | null;
  fallbackUsed?: boolean;
  unknownPriorCharge?: boolean;
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
      costSource: args.costUsd === null ? "unknown" : "reconciled",
      pricingVersion: findCatalogModel(args.provider, args.resolvedModel)?.verifiedAt ?? null,
      latencyMs: args.latencyMs,
      timeToFirstTokenMs: args.ttftMs,
      statusCode: args.statusCode,
      attemptIndex: args.attemptIndex,
      fallbackFromCallId: args.fallbackFromCallId ?? null,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      metadata: {
        contentStored: false,
        gateway: true,
        fallbackUsed: args.fallbackUsed === true,
        runCostAmbiguous: args.unknownPriorCharge === true,
      },
    });
    const terminalStatus = args.statusCode >= 200 && args.statusCode < 400 ? "completed" : "failed";
    const authoritativeRunCost = args.unknownPriorCharge ? null : args.costUsd;
    await tx.update(runs).set({
      endedAt: args.endedAt,
      status: terminalStatus,
      terminationReason: terminalStatus === "failed" ? `provider_http_${args.statusCode}` : null,
      actualCostUsd: authoritativeRunCost === null ? null : authoritativeRunCost.toString(),
      reconciledCostUsd: authoritativeRunCost === null ? null : authoritativeRunCost.toString(),
      freshInputTokens: args.usage.freshInputTokens ?? 0,
      cacheReadTokens: args.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: args.usage.cacheWriteTokens ?? 0,
      reasoningTokens: args.usage.reasoningTokens ?? 0,
      outputTokens: args.usage.outputTokens ?? 0,
      retryCount: args.retryCount,
      fallbackCount: args.fallbackUsed ? 1 : 0,
      turnCount: 1,
      usageSource: args.unknownPriorCharge ? "estimated" : "provider_measured",
      updatedAt: args.endedAt,
    }).where(and(eq(runs.id, args.runId), eq(runs.organizationId, args.organizationId)));
  });
  return callId;
}

async function terminateRun(organizationId: string, runId: string, reason: string, retryCount: number, fallbackUsed: boolean) {
  const endedAt = new Date();
  await getDb().update(runs).set({
    status: "failed",
    endedAt,
    terminationReason: reason,
    actualCostUsd: null,
    reconciledCostUsd: null,
    retryCount,
    fallbackCount: fallbackUsed ? 1 : 0,
    usageSource: "estimated",
    updatedAt: endedAt,
  }).where(and(eq(runs.id, runId), eq(runs.organizationId, organizationId)));
}

function retryDelay(attempt: number): number {
  const base = Math.min(250 * (2 ** attempt), 2_000);
  return base + Math.floor(Math.random() * 150);
}

async function evaluateCallPolicy(args: {
  principal: ApiPrincipal;
  input: GovernedGatewayRequest;
  projectId: string | null;
  runId: string;
  provider: string;
  model: string;
  estimatedCost: number | null;
  retryCount: number;
  isFallback: boolean;
  fallbackPremiumUsd?: number;
}) {
  return evaluateOrganizationPolicy(args.principal.organizationId, {
    projectId: args.projectId,
    environment: args.input.environment,
    serviceAccountId: args.principal.serviceAccountId ?? undefined,
    apiKeyId: args.principal.apiKeyId,
    agent: args.input.agentName,
    workflow: args.input.workflowName ?? undefined,
    runId: args.runId,
    observedCostUsd: 0,
    projectedNextCallCostUsd: args.estimatedCost ?? undefined,
    tokens: 0,
    turns: 0,
    retries: args.retryCount,
    failedToolCalls: 0,
    toolCalls: 0,
    provider: args.provider,
    model: args.model,
    isFallback: args.isFallback,
    fallbackPremiumUsd: args.fallbackPremiumUsd,
  });
}

async function callProviderWithPolicy(args: {
  adapter: GatewayProviderAdapter;
  credential: string;
  principal: ApiPrincipal;
  input: GovernedGatewayRequest;
  projectId: string | null;
  runId: string;
  provider: string;
  model: string;
  estimatedCost: number | null;
  initialRetryCount: number;
  isFallback: boolean;
  fallbackPremiumUsd?: number;
  fallbackFromCallId?: string | null;
}): Promise<ProviderAttemptResult> {
  let unknownPriorCharge = false;
  let retryCount = args.initialRetryCount;
  let lastAttemptId: string | null = args.fallbackFromCallId ?? null;

  for (let attemptIndex = 0; attemptIndex < 3; attemptIndex += 1) {
    const policy = await evaluateCallPolicy({
      principal: args.principal,
      input: args.input,
      projectId: args.projectId,
      runId: args.runId,
      provider: args.provider,
      model: args.model,
      estimatedCost: args.estimatedCost,
      retryCount,
      isFallback: args.isFallback,
      fallbackPremiumUsd: args.fallbackPremiumUsd,
    });
    if (policy.enforcement !== "continue") {
      return { kind: "blocked", policy, retryCount, unknownPriorCharge, lastAttemptId };
    }

    const request: GatewayRequest = {
      model: args.model,
      input: args.input.input,
      maxOutputTokens: args.input.maxOutputTokens,
      stream: args.input.stream,
      temperature: args.input.temperature,
      metadata: args.input.metadata,
    };
    const upstream = args.adapter.buildRequest(request, args.credential);
    const startedAt = new Date();
    let response: Response;
    try {
      response = await fetch(upstream.url, {
        ...upstream.init,
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
      });
    } catch (error) {
      const endedAt = new Date();
      const delayMs = attemptIndex < 2 ? retryDelay(attemptIndex) : null;
      lastAttemptId = await persistAttempt({
        organizationId: args.principal.organizationId,
        runId: args.runId,
        provider: args.provider,
        model: args.model,
        fallbackFromCallId: args.fallbackFromCallId,
        attempt: {
          attemptIndex,
          statusCode: null,
          startedAt,
          endedAt,
          providerRequestId: null,
          reason: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network_error",
          delayMs,
        },
      });
      unknownPriorCharge = true;
      if (attemptIndex === 2) throw new Error("GATEWAY_UPSTREAM_UNAVAILABLE");
      retryCount += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs ?? 0));
      continue;
    }

    if (!args.adapter.retryable(response.status) || attemptIndex === 2) {
      return { kind: "response", response, attemptIndex, retryCount, unknownPriorCharge, policy };
    }

    const endedAt = new Date();
    const delayMs = retryDelay(attemptIndex);
    lastAttemptId = await persistAttempt({
      organizationId: args.principal.organizationId,
      runId: args.runId,
      provider: args.provider,
      model: args.model,
      fallbackFromCallId: args.fallbackFromCallId,
      attempt: {
        attemptIndex,
        statusCode: response.status,
        startedAt,
        endedAt,
        providerRequestId: providerRequestId(response),
        reason: `http_${response.status}`,
        delayMs,
      },
    });
    unknownPriorCharge = true;
    retryCount += 1;
    try { await response.body?.cancel(); } catch { /* cleanup only */ }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("GATEWAY_RETRY_EXHAUSTED");
}

function policyBlockedResponse(runId: string, policy: PolicyResult, error: string) {
  return Response.json({
    error,
    action: policy.decision.action,
    reason: policy.decision.reason,
    runId,
  }, {
    status: policy.enforcement === "await_approval" ? 409 : 402,
    headers: { "Cache-Control": "no-store", "x-ti-run-id": runId },
  });
}

export async function executeGovernedGateway(
  principal: ApiPrincipal,
  input: GovernedGatewayRequest,
  expectedProvider: GatewayProviderName,
): Promise<GatewayExecutionResult> {
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
  if (connection.provider !== expectedProvider) throw new Error("PROVIDER_CONNECTION_MISMATCH");
  if (connection.status !== "verified") throw new Error("PROVIDER_CONNECTION_NOT_VERIFIED");
  const adapter = providerForName(connection.provider);
  if (!adapter) throw new Error("PROVIDER_UNSUPPORTED");

  const runId = input.runId ?? `run_${randomUUID()}`;
  const startedAt = new Date();
  const estimatedInputTokens = estimateTokens(input.input);
  const estimatedCost = estimateModelCost(connection.provider, input.model, estimatedInputTokens, input.maxOutputTokens);
  await ensureRun({
    runId,
    organizationId: principal.organizationId,
    projectId,
    serviceAccountId: principal.serviceAccountId,
    apiKeyId: principal.apiKeyId,
    input,
    provider: connection.provider,
    estimatedInputTokens,
    estimatedCost,
    startedAt,
  });

  let credential: string;
  try {
    credential = decryptProviderCredential(connection);
  } catch {
    await terminateRun(principal.organizationId, runId, "credential_decryption_failed", 0, false);
    throw new Error("PROVIDER_CREDENTIAL_DECRYPTION_FAILED");
  }
  await db.update(runs).set({ status: "running", updatedAt: new Date() }).where(and(eq(runs.id, runId), eq(runs.organizationId, principal.organizationId)));

  let activeModel = input.model;
  let fallbackUsed = false;
  let fallbackFromCallId: string | null = null;
  let totalRetryCount = 0;
  let unknownPriorCharge = false;
  let upstreamStarted = Date.now();
  let attempt: ProviderAttemptResult;

  try {
    attempt = await callProviderWithPolicy({
      adapter,
      credential,
      principal,
      input,
      projectId,
      runId,
      provider: connection.provider,
      model: activeModel,
      estimatedCost,
      initialRetryCount: 0,
      isFallback: false,
    });
  } catch (error) {
    await terminateRun(principal.organizationId, runId, error instanceof Error ? error.message.toLowerCase() : "gateway_upstream_unavailable", 2, false);
    throw error;
  }

  if (attempt.kind === "blocked") {
    await db.update(runs).set({
      status: "budget_blocked",
      endedAt: new Date(),
      terminationReason: attempt.policy.decision.action,
      retryCount: attempt.retryCount,
      usageSource: attempt.unknownPriorCharge ? "estimated" : "provider_measured",
      updatedAt: new Date(),
    }).where(and(eq(runs.id, runId), eq(runs.organizationId, principal.organizationId)));
    return {
      runId,
      callId: attempt.lastAttemptId,
      policyAction: attempt.policy.decision.action,
      response: policyBlockedResponse(runId, attempt.policy, "GATEWAY_POLICY_BLOCKED"),
    };
  }

  totalRetryCount = attempt.retryCount;
  unknownPriorCharge = attempt.unknownPriorCharge;

  if (!attempt.response.ok && adapter.retryable(attempt.response.status) && input.fallbackModel && input.fallbackModel !== activeModel) {
    const finalPrimaryAttempt: RetryAttempt = {
      attemptIndex: attempt.attemptIndex,
      statusCode: attempt.response.status,
      startedAt: new Date(upstreamStarted),
      endedAt: new Date(),
      providerRequestId: providerRequestId(attempt.response),
      reason: `http_${attempt.response.status}_fallback_candidate`,
      delayMs: null,
    };
    fallbackFromCallId = await persistAttempt({
      organizationId: principal.organizationId,
      runId,
      provider: connection.provider,
      model: activeModel,
      attempt: finalPrimaryAttempt,
    });
    unknownPriorCharge = true;
    try { await attempt.response.body?.cancel(); } catch { /* cleanup only */ }

    const fallbackEstimate = estimateModelCost(connection.provider, input.fallbackModel, estimatedInputTokens, input.maxOutputTokens);
    const premium = estimatedCost !== null && fallbackEstimate !== null ? Math.max(fallbackEstimate - estimatedCost, 0) : undefined;
    fallbackUsed = true;
    activeModel = input.fallbackModel;
    upstreamStarted = Date.now();

    try {
      const fallbackAttempt = await callProviderWithPolicy({
        adapter,
        credential,
        principal,
        input,
        projectId,
        runId,
        provider: connection.provider,
        model: activeModel,
        estimatedCost: fallbackEstimate,
        initialRetryCount: totalRetryCount,
        isFallback: true,
        fallbackPremiumUsd: premium,
        fallbackFromCallId,
      });
      if (fallbackAttempt.kind === "blocked") {
        await db.update(runs).set({
          status: "budget_blocked",
          endedAt: new Date(),
          terminationReason: fallbackAttempt.policy.decision.action,
          retryCount: fallbackAttempt.retryCount,
          fallbackCount: 1,
          actualCostUsd: null,
          reconciledCostUsd: null,
          usageSource: "estimated",
          updatedAt: new Date(),
        }).where(and(eq(runs.id, runId), eq(runs.organizationId, principal.organizationId)));
        return {
          runId,
          callId: fallbackAttempt.lastAttemptId,
          policyAction: fallbackAttempt.policy.decision.action,
          response: policyBlockedResponse(runId, fallbackAttempt.policy, "GATEWAY_FALLBACK_BLOCKED"),
        };
      }
      attempt = fallbackAttempt;
      totalRetryCount = fallbackAttempt.retryCount;
      unknownPriorCharge = unknownPriorCharge || fallbackAttempt.unknownPriorCharge;
    } catch (error) {
      await terminateRun(principal.organizationId, runId, error instanceof Error ? error.message.toLowerCase() : "gateway_fallback_unavailable", totalRetryCount, true);
      throw error;
    }
  }

  if (attempt.kind !== "response") throw new Error("GATEWAY_INTERNAL_STATE_INVALID");
  const upstreamResponse = attempt.response;
  const attemptIndex = attempt.attemptIndex;
  const finalPolicy = attempt.policy;
  const latencyAtHeaders = Date.now() - upstreamStarted;
  const baseHeaders = new Headers(upstreamResponse.headers);
  baseHeaders.set("Cache-Control", "no-store");
  baseHeaders.set("x-ti-run-id", runId);
  baseHeaders.set("x-ti-policy-action", finalPolicy.decision.action);
  baseHeaders.set("x-ti-model-resolved", activeModel);
  baseHeaders.set("x-ti-cost-certainty", unknownPriorCharge ? "partial_unknown" : "provider_reconciled");
  baseHeaders.delete("content-length");

  if (input.stream && upstreamResponse.body) {
    const decoder = new TextDecoder();
    let buffered = "";
    let firstChunkAt: number | null = null;
    const requestId = providerRequestId(upstreamResponse);
    const transformed = upstreamResponse.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (firstChunkAt === null) firstChunkAt = Date.now();
        if (buffered.length < 4_000_000) buffered += decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      async flush() {
        buffered += decoder.decode();
        const usage = parseSseUsage(adapter, buffered);
        const endedAt = new Date();
        const cost = costForUsage(connection.provider, activeModel, usage);
        const callId = await persistCall({
          organizationId: principal.organizationId,
          runId,
          provider: connection.provider,
          requestedModel: input.model,
          resolvedModel: activeModel,
          providerRequestId: requestId,
          statusCode: upstreamResponse.status,
          startedAt: new Date(upstreamStarted),
          endedAt,
          latencyMs: endedAt.getTime() - upstreamStarted,
          ttftMs: firstChunkAt === null ? null : firstChunkAt - upstreamStarted,
          usage,
          costUsd: cost,
          attemptIndex,
          retryCount: totalRetryCount,
          fallbackFromCallId,
          fallbackUsed,
          unknownPriorCharge,
        });
        void callId;
        await exportGatewayTrace({
          runId,
          projectId,
          agentName: input.agentName,
          workflowName: input.workflowName ?? null,
          provider: connection.provider,
          requestedModel: input.model,
          resolvedModel: activeModel,
          providerRequestId: requestId,
          startedAt: new Date(upstreamStarted),
          endedAt,
          statusCode: upstreamResponse.status,
          latencyMs: endedAt.getTime() - upstreamStarted,
          ttftMs: firstChunkAt === null ? null : firstChunkAt - upstreamStarted,
          attemptIndex,
          fallbackUsed,
          policyAction: finalPolicy.decision.action,
          usage,
          costUsd: cost,
        }).catch(() => "failed");
      },
    }));
    return {
      runId,
      callId: null,
      policyAction: finalPolicy.decision.action,
      response: new Response(transformed, { status: upstreamResponse.status, headers: baseHeaders }),
    };
  }

  const rawText = await upstreamResponse.text();
  let payload: unknown = null;
  try { payload = rawText ? JSON.parse(rawText) : null; } catch { payload = null; }
  const endedAt = new Date();
  const usage = payload === null ? EMPTY_USAGE : adapter.normalizeUsage(payload);
  const resolvedModel = payload === null ? activeModel : adapter.resolvedModel(payload, activeModel);
  const requestId = payload === null ? providerRequestId(upstreamResponse) : adapter.providerRequestId(payload, upstreamResponse);
  const cost = costForUsage(connection.provider, resolvedModel, usage);
  const callId = await persistCall({
    organizationId: principal.organizationId,
    runId,
    provider: connection.provider,
    requestedModel: input.model,
    resolvedModel,
    providerRequestId: requestId,
    statusCode: upstreamResponse.status,
    startedAt: new Date(upstreamStarted),
    endedAt,
    latencyMs: endedAt.getTime() - upstreamStarted,
    ttftMs: latencyAtHeaders,
    usage,
    costUsd: cost,
    attemptIndex,
    retryCount: totalRetryCount,
    fallbackFromCallId,
    fallbackUsed,
    unknownPriorCharge,
  });

  await exportGatewayTrace({
    runId,
    projectId,
    agentName: input.agentName,
    workflowName: input.workflowName ?? null,
    provider: connection.provider,
    requestedModel: input.model,
    resolvedModel,
    providerRequestId: requestId,
    startedAt: new Date(upstreamStarted),
    endedAt,
    statusCode: upstreamResponse.status,
    latencyMs: endedAt.getTime() - upstreamStarted,
    ttftMs: latencyAtHeaders,
    attemptIndex,
    fallbackUsed,
    policyAction: finalPolicy.decision.action,
    usage,
    costUsd: cost,
  }).catch(() => "failed");

  baseHeaders.set("x-ti-call-id", callId);
  baseHeaders.set("x-ti-usage-source", unknownPriorCharge ? "partial_unknown" : "provider_measured");
  if (cost !== null) baseHeaders.set("x-ti-final-call-cost-usd", cost.toFixed(8));
  if (cost !== null && !unknownPriorCharge) baseHeaders.set("x-ti-reconciled-cost-usd", cost.toFixed(8));
  baseHeaders.set("content-type", upstreamResponse.headers.get("content-type") ?? "application/json");
  return {
    runId,
    callId,
    policyAction: finalPolicy.decision.action,
    response: new Response(rawText, { status: upstreamResponse.status, headers: baseHeaders }),
  };
}
