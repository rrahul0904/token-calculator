import { randomUUID } from "node:crypto";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { apiKeyQuotas } from "@/db/controls-schema";
import { organizations, usageEvents } from "@/db/schema";
import { authenticateApiKey } from "@/lib/auth/api-auth";
import { hasEntitlement, PLAN_ENTITLEMENTS } from "@/lib/billing/entitlements";
import { parseIdempotencyKey } from "@/lib/inference/simulation";
import {
  LIVE_INFERENCE_SOURCE, MAX_LIVE_REQUEST_BYTES,
  callLiveProvider, estimateReservedTokens, liveRequestDigest,
  parseLiveRequest, parseUpstreamConfig, type LiveRequest,
} from "@/lib/inference/live-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(code: string, status: number, retryAfter?: number): Response {
  return Response.json({ error: { code } }, {
    status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff",
      ...(retryAfter ? { "retry-after": String(retryAfter) } : {}) },
  });
}

async function readBoundedRequest(request: Request): Promise<string> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_LIVE_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_LIVE_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("INVALID_ENCODING"); }
}

type Reject = { kind: "rejected"; code: string; status: number; retryAfter?: number };
type Admit = { kind: "admitted"; sourceEventId: string; reservationId: string };
type Decision = Admit | Reject;
type Receipt = {
  apiKeyId: string; requestHash: string; inputEstimate: number;
  reservedTokens: number; model: string; providerLane: "local" | "approved_remote";
};

/**
 * Provider-backed, explicitly opt-in endpoint. PostgreSQL reservation always
 * commits BEFORE sending any prompt; no secrets/content are stored in receipts.
 * Idempotent repeats are refused (not replayed), because responses are not stored.
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env.TI_INFERENCE_LIVE_ENABLED !== "1") return reply("INFERENCE_DISABLED", 404);
  if (!isDatabaseConfigured()) return reply("DATABASE_NOT_CONFIGURED", 503);
  let config;
  try { config = parseUpstreamConfig(process.env); }
  catch { return reply("INFERENCE_UPSTREAM_NOT_APPROVED", 503); }
  let principal;
  try { principal = await authenticateApiKey(request, "gateway:invoke"); }
  catch { return reply("AUTH_BACKEND_UNAVAILABLE", 503); }
  if (!principal) return reply("API_KEY_REQUIRED", 401);

  const idempotency = parseIdempotencyKey(request.headers.get("idempotency-key"));
  if (!idempotency) return reply("IDEMPOTENCY_KEY_REQUIRED", 400);
  let raw: unknown;
  try { raw = JSON.parse(await readBoundedRequest(request)) as unknown; }
  catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") return reply("REQUEST_TOO_LARGE", 413);
    return reply("INVALID_REQUEST_BODY", 400);
  }
  const parsed = parseLiveRequest(raw, config.model);
  if (!parsed.ok) return reply(parsed.code, 400);
  const liveRequest: LiveRequest = parsed.data;
  const requestHash = liveRequestDigest(liveRequest);
  const estimated = estimateReservedTokens(liveRequest);
  const db = getDb();

  try {
    const [org] = await db.select({ plan: organizations.plan }).from(organizations)
      .where(eq(organizations.id, principal.organizationId)).limit(1);
    if (!org || org.plan !== "enterprise" || !hasEntitlement(PLAN_ENTITLEMENTS.enterprise, "gateway")) {
      return reply("GATEWAY_PLAN_REQUIRED", 403);
    }
    const [quota] = await db.select({
      enabled: apiKeyQuotas.enabled,
      requestsPerMinute: apiKeyQuotas.requestsPerMinute,
      monthlyTokenLimit: apiKeyQuotas.monthlyTokenLimit,
      monthlyCostLimitUsd: apiKeyQuotas.monthlyCostLimitUsd,
    }).from(apiKeyQuotas).where(and(
      eq(apiKeyQuotas.apiKeyId, principal.apiKeyId),
      eq(apiKeyQuotas.organizationId, principal.organizationId),
    )).limit(1);
    if (!quota?.enabled || !Number.isInteger(quota.requestsPerMinute) || quota.requestsPerMinute < 1) {
      return reply("API_KEY_QUOTA_DISABLED", 403);
    }
    // Dollars require a verified price schedule and accounting; never invent a cost.
    if (quota.monthlyCostLimitUsd !== null) return reply("COST_QUOTA_REQUIRES_VERIFIED_PRICING", 403);
    const monthlyTokenLimit = quota.monthlyTokenLimit;
    if (monthlyTokenLimit === null) return reply("MONTHLY_TOKEN_CAP_REQUIRED", 403);

    const decision: Decision = await db.transaction(async (tx): Promise<Decision> => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${principal.organizationId}), hashtext(${principal.apiKeyId}))`);
      const sourceEventId = `${principal.apiKeyId}:${idempotency}`;
      const [prior] = await tx.select({ payload: usageEvents.payload }).from(usageEvents).where(and(
        eq(usageEvents.organizationId, principal.organizationId),
        eq(usageEvents.source, LIVE_INFERENCE_SOURCE),
        eq(usageEvents.sourceEventId, sourceEventId),
      )).limit(1);
      if (prior) {
        const receipt = prior.payload as Partial<Receipt>;
        return { kind: "rejected", status: 409,
          code: receipt.apiKeyId === principal.apiKeyId && receipt.requestHash === requestHash
            ? "REQUEST_ALREADY_ACCEPTED_RESPONSE_NOT_STORED" : "IDEMPOTENCY_KEY_CONFLICT" };
      }
      const now = new Date();
      const filters = [
        eq(usageEvents.organizationId, principal.organizationId),
        eq(usageEvents.source, LIVE_INFERENCE_SOURCE),
        eq(usageEvents.eventType, "inference.admitted"),
        sql`${usageEvents.payload} ->> 'apiKeyId' = ${principal.apiKeyId}`,
      ];
      const [rpm] = await tx.select({ n: count() }).from(usageEvents)
        .where(and(...filters, gte(usageEvents.occurredAt, new Date(now.getTime() - 60_000))));
      if (Number(rpm?.n ?? 0) >= quota.requestsPerMinute) {
        return { kind: "rejected", status: 429, code: "REQUESTS_PER_MINUTE_EXCEEDED", retryAfter: 60 };
      }
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const [monthly] = await tx.select({
        reserved: sql<string>`coalesce(sum((${usageEvents.payload} ->> 'reservedTokens')::int), 0)`,
      }).from(usageEvents).where(and(...filters, gte(usageEvents.occurredAt, monthStart)));
      if (Number(monthly?.reserved ?? 0) + estimated.reserve > monthlyTokenLimit) {
        return { kind: "rejected", status: 429, code: "MONTHLY_RESERVATION_CAP_EXCEEDED" };
      }

      const reservationId = `iev_${randomUUID()}`;
      const payload: Receipt = {
        apiKeyId: principal.apiKeyId, requestHash, inputEstimate: estimated.inputEstimate,
        reservedTokens: estimated.reserve, model: config.model, providerLane: config.lane,
      };
      await tx.insert(usageEvents).values({
        id: reservationId, organizationId: principal.organizationId, projectId: principal.projectId,
        sourceEventId, source: LIVE_INFERENCE_SOURCE, eventType: "inference.admitted",
        occurredAt: now, payload,
      });
      return { kind: "admitted", sourceEventId, reservationId };
    });
    if (decision.kind === "rejected") return reply(decision.code, decision.status, decision.retryAfter);

    let result;
    let terminalStatus = "failed";
    let failureCode = "PROVIDER_UNAVAILABLE";
    try {
      result = await callLiveProvider(config, liveRequest);
      terminalStatus = "completed";
    } catch (error) {
      failureCode = error instanceof Error && error.message.startsWith("PROVIDER_") ? error.message : "PROVIDER_UNAVAILABLE";
    }

    // Auditable terminal record; no provider output, raw prompt or secrets stored.
    try {
      await db.insert(usageEvents).values({
        id: `iev_${randomUUID()}`, organizationId: principal.organizationId, projectId: principal.projectId,
        sourceEventId: decision.sourceEventId + ":settled", source: LIVE_INFERENCE_SOURCE,
        eventType: terminalStatus === "completed" ? "inference.completed" : "inference.failed",
        occurredAt: new Date(),
        payload: {
          apiKeyId: principal.apiKeyId,
          reservationEventId: decision.reservationId,
          outcome: terminalStatus,
          ...(result?.usage ? { reportedInputTokens: result.usage.prompt_tokens,
            reportedOutputTokens: result.usage.completion_tokens } : {}),
          ...(terminalStatus !== "completed" ? { providerErrorCode: failureCode } : {}),
          billingState: "not_billed",
        },
      });
    } catch {
      // Provider may have run, but a missing durable terminal receipt is NOT success.
      return reply("INFERENCE_RECEIPT_PERSISTENCE_FAILED", 503);
    }
    if (!result) return reply(failureCode, 502);
    return Response.json({
      id: result.id,
      object: "chat.completion",
      model: result.model,
      choices: [{ index: 0, message: { role: "assistant", content: result.output }, finish_reason: "stop" }],
      usage: result.usage,
      receipt_id: decision.reservationId,
      billing_state: "not_billed",
    }, { status: 200, headers: {
      "cache-control": "no-store", "x-content-type-options": "nosniff",
      "x-inference-upstream-invoked": "true",
    } });
  } catch {
    return reply("INFERENCE_ADMISSION_BACKEND_UNAVAILABLE", 503);
  }
}
