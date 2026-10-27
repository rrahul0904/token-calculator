import { randomUUID } from "node:crypto";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { apiKeyQuotas } from "@/db/controls-schema";
import { organizations, usageEvents } from "@/db/schema";
import { authenticateApiKey } from "@/lib/auth/api-auth";
import { PLAN_ENTITLEMENTS, hasEntitlement } from "@/lib/billing/entitlements";
import {
  SIMULATION_SOURCE,
  makeSimulationReceipt,
  parseIdempotencyKey,
  parseSimulationRequest,
  requestDigest,
  simulationResponse,
  type SimulationReceipt,
} from "@/lib/inference/simulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 20_000;

function error(code: string, status: number, retryAfter?: number): Response {
  return Response.json(
    { error: { code, message: code.replaceAll("_", " ").toLowerCase() } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Inference-Simulated": "true",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}

type StoredPayload = {
  apiKeyId?: string;
  requestHash?: string;
  receipt?: SimulationReceipt;
};

type Accepted = { kind: "accepted"; receipt: SimulationReceipt; replay: boolean };
type Rejected = { kind: "rejected"; status: number; code: string; retryAfter?: number };

/**
 * A transactional, lock-protected acceptance lane. Never calls a provider.
 * This is intentionally NOT a production inference endpoint.
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env.INFERENCE_SIMULATION_ENABLED !== "1") return error("SIMULATION_DISABLED", 404);
  if (!isDatabaseConfigured()) return error("DATABASE_NOT_CONFIGURED", 503);
  // A session cookie does not grant inference access; a properly scoped API key is required.
  let principal;
  try {
    principal = await authenticateApiKey(request, "gateway:invoke");
  } catch {
    return error("AUTH_BACKEND_UNAVAILABLE", 503);
  }
  if (!principal) return error("API_KEY_REQUIRED", 401);

  const idempotencyKey = parseIdempotencyKey(request.headers.get("idempotency-key"));
  if (!idempotencyKey) return error("IDEMPOTENCY_KEY_REQUIRED", 400);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return error("REQUEST_TOO_LARGE", 413);
  }
  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return error("INVALID_BODY", 400);
  }
  if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) return error("REQUEST_TOO_LARGE", 413);

  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    return error("INVALID_JSON", 400);
  }
  const parsed = parseSimulationRequest(raw);
  if (!parsed.ok) return error(parsed.code, 400);
  const digest = requestDigest(parsed.data);
  const db = getDb();

  try {
    const [org] = await db.select({ plan: organizations.plan }).from(organizations)
      .where(eq(organizations.id, principal.organizationId)).limit(1);
    // Reuse the existing gateway entitlement rather than creating a second billing tier.
    if (!org || org.plan !== "enterprise" || !hasEntitlement(PLAN_ENTITLEMENTS.enterprise, "gateway")) {
      return error("GATEWAY_PLAN_REQUIRED", 403);
    }
    const [quota] = await db.select({
      enabled: apiKeyQuotas.enabled,
      requestsPerMinute: apiKeyQuotas.requestsPerMinute,
      monthlyTokenLimit: apiKeyQuotas.monthlyTokenLimit,
    }).from(apiKeyQuotas)
      .where(and(
        eq(apiKeyQuotas.apiKeyId, principal.apiKeyId),
        eq(apiKeyQuotas.organizationId, principal.organizationId),
      )).limit(1);
    if (!quota?.enabled || !Number.isInteger(quota.requestsPerMinute) || quota.requestsPerMinute < 1) {
      return error("API_KEY_QUOTA_DISABLED", 403);
    }

    const result: Accepted | Rejected = await db.transaction(async (tx): Promise<Accepted | Rejected> => {
      // The two 32-bit advisory-lock keys serialize admission per org and API key.
      // Hash collisions only serialize unrelated keys; they do not merge ownership.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${principal.organizationId}), hashtext(${principal.apiKeyId}))`);

      const sourceEventId = `${principal.apiKeyId}:${idempotencyKey}`;
      const [prior] = await tx.select({ payload: usageEvents.payload }).from(usageEvents)
        .where(and(
          eq(usageEvents.organizationId, principal.organizationId),
          eq(usageEvents.source, SIMULATION_SOURCE),
          eq(usageEvents.sourceEventId, sourceEventId),
        )).limit(1);
      if (prior) {
        const stored = prior.payload as StoredPayload;
        if (stored.requestHash !== digest || !stored.receipt || stored.apiKeyId !== principal.apiKeyId) {
          return { kind: "rejected", status: 409, code: "IDEMPOTENCY_KEY_CONFLICT" };
        }
        return { kind: "accepted", receipt: stored.receipt, replay: true };
      }

      const now = new Date();
      const [minute] = await tx.select({ n: count() }).from(usageEvents)
        .where(and(
          eq(usageEvents.organizationId, principal.organizationId),
          eq(usageEvents.source, SIMULATION_SOURCE),
          gte(usageEvents.occurredAt, new Date(now.getTime() - 60_000)),
          sql`${usageEvents.payload} ->> 'apiKeyId' = ${principal.apiKeyId}`,
        ));
      if (Number(minute?.n ?? 0) >= quota.requestsPerMinute) {
        return { kind: "rejected", status: 429, code: "REQUESTS_PER_MINUTE_EXCEEDED", retryAfter: 60 };
      }

      const receipt = makeSimulationReceipt(parsed.data);
      // Only estimated input usage is tracked; NO real model tokens were billed.
      if (quota.monthlyTokenLimit !== null) {
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const [month] = await tx.select({
          estimatedTokens: sql<string>`coalesce(sum((${usageEvents.payload} ->> 'inputTokenEstimate')::int), 0)`,
        }).from(usageEvents).where(and(
          eq(usageEvents.organizationId, principal.organizationId),
          eq(usageEvents.source, SIMULATION_SOURCE),
          gte(usageEvents.occurredAt, monthStart),
          sql`${usageEvents.payload} ->> 'apiKeyId' = ${principal.apiKeyId}`,
        ));
        if (Number(month?.estimatedTokens ?? 0) + receipt.inputTokenEstimate > quota.monthlyTokenLimit) {
          return { kind: "rejected", status: 429, code: "ESTIMATED_MONTHLY_TOKEN_CAP_EXCEEDED" };
        }
      }

      // No raw prompt, authorization header or provider key is ever persisted.
      await tx.insert(usageEvents).values({
        id: `iev_${randomUUID()}`,
        organizationId: principal.organizationId,
        projectId: principal.projectId,
        sourceEventId,
        source: SIMULATION_SOURCE,
        eventType: "simulation.admitted",
        occurredAt: now,
        payload: {
          apiKeyId: principal.apiKeyId,
          requestHash: digest,
          inputTokenEstimate: receipt.inputTokenEstimate,
          receipt,
          simulated: true,
          policy: "enterprise_gateway_with_key_quota_v1",
        },
      });
      return { kind: "accepted", receipt, replay: false };
    });
    if (result.kind === "rejected") return error(result.code, result.status, result.retryAfter);
    return simulationResponse(result.receipt, parsed.data.stream, result.replay);
  } catch {
    // Fail closed if a migration, credential, quota query or DB transaction fails.
    return error("SIMULATION_BACKEND_UNAVAILABLE", 503);
  }
}
