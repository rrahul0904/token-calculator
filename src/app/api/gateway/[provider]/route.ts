import { isDatabaseConfigured } from "@/db/client";
import { dispatchAlert, type AlertEnvelope } from "@/lib/alerts/webhooks";
import { authenticateApiKey } from "@/lib/auth/api-auth";
import { executeGovernedGateway, gatewayRequestSchema } from "@/lib/gateway/execute";
import type { GatewayProviderName } from "@/lib/gateway/provider-connectivity";
import { checkApiKeyQuota } from "@/lib/gateway/quota";
import { consumeGatewayRateLimit } from "@/lib/gateway/rate-limit";
import { isVaultConfigured } from "@/lib/security/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function reply(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

async function safeAlert(envelope: AlertEnvelope) {
  try { await dispatchAlert(envelope); } catch { /* Observability must never change the gateway's authoritative result. */ }
}

function statusForError(message: string) {
  if (message === "GATEWAY_ENTITLEMENT_REQUIRED") return 402;
  if (message === "PROJECT_SCOPE_VIOLATION" || message === "RUN_SCOPE_VIOLATION") return 403;
  if (message === "PROJECT_NOT_FOUND" || message === "PROVIDER_CONNECTION_NOT_FOUND" || message === "ORGANIZATION_NOT_FOUND") return 404;
  if (message === "PROVIDER_UNSUPPORTED" || message === "PROVIDER_CONNECTION_MISMATCH" || message === "PROVIDER_CONNECTION_NOT_VERIFIED") return 400;
  if (message === "GATEWAY_UPSTREAM_UNAVAILABLE" || message === "GATEWAY_RETRY_EXHAUSTED") return 502;
  if (message === "PROVIDER_CREDENTIAL_DECRYPTION_FAILED" || message === "ENCRYPTION_KEY_NOT_CONFIGURED" || message === "ENCRYPTION_KEY_INVALID_LENGTH") return 503;
  return 500;
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  if (!isVaultConfigured()) return reply({ error: "CREDENTIAL_VAULT_NOT_CONFIGURED" }, 503);
  const principal = await authenticateApiKey(request, "gateway:invoke");
  if (!principal) return reply({ error: "UNAUTHORIZED", requiredScope: "gateway:invoke" }, 401);

  try {
    const quota = await checkApiKeyQuota(principal.organizationId, principal.apiKeyId);
    if (!quota.allowed) {
      await safeAlert({ eventType: "gateway.quota_exceeded", organizationId: principal.organizationId, resourceType: "api_key", resourceId: principal.apiKeyId, data: { reason: quota.reason, usedTokens: quota.state.usedTokens, monthlyTokenLimit: quota.state.monthlyTokenLimit, usedCostUsd: quota.state.usedCostUsd, monthlyCostLimitUsd: quota.state.monthlyCostLimitUsd } });
      return reply({ error: quota.reason, resetAt: quota.state.resetAt.toISOString(), monthlyTokenLimit: quota.state.monthlyTokenLimit, monthlyCostLimitUsd: quota.state.monthlyCostLimitUsd, usedTokens: quota.state.usedTokens, usedCostUsd: quota.state.usedCostUsd }, 429, { "x-ratelimit-reset": quota.state.resetAt.toISOString() });
    }

    const rate = await consumeGatewayRateLimit(principal.organizationId, principal.apiKeyId, quota.state.requestsPerMinute);
    if (!rate.allowed) {
      await safeAlert({ eventType: "gateway.quota_exceeded", organizationId: principal.organizationId, resourceType: "api_key", resourceId: principal.apiKeyId, data: { reason: "RATE_LIMIT_EXCEEDED", limit: rate.limit, resetAt: rate.resetAt.toISOString() } });
      return reply({ error: "RATE_LIMIT_EXCEEDED", limit: rate.limit, resetAt: rate.resetAt.toISOString() }, 429, { "x-ratelimit-limit": String(rate.limit), "x-ratelimit-remaining": "0", "x-ratelimit-reset": rate.resetAt.toISOString() });
    }
  } catch {
    return reply({ error: "RATE_LIMIT_AUTHORITY_UNAVAILABLE" }, 503);
  }

  const { provider } = await context.params;
  if (!(["openai", "anthropic", "gemini"] as const).includes(provider as GatewayProviderName)) return reply({ error: "PROVIDER_UNSUPPORTED", provider }, 404);
  const parsed = gatewayRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  try {
    const result = await executeGovernedGateway(principal, parsed.data, provider as GatewayProviderName);
    if (["BLOCK_NEXT_CALL", "KILL_RUN"].includes(result.policyAction)) {
      await safeAlert({ eventType: result.policyAction === "KILL_RUN" ? "run.killed" : "budget.blocked", organizationId: principal.organizationId, resourceType: "run", resourceId: result.runId, data: { action: result.policyAction, provider, projectId: parsed.data.projectId ?? principal.projectId } });
    } else if (result.policyAction === "REQUIRE_APPROVAL") {
      await safeAlert({ eventType: "fallback.approval_required", organizationId: principal.organizationId, resourceType: "run", resourceId: result.runId, data: { action: result.policyAction, provider, requestedModel: parsed.data.model, fallbackModel: parsed.data.fallbackModel ?? null } });
    } else if (["WARN", "NOTIFY"].includes(result.policyAction)) {
      await safeAlert({ eventType: "budget.warned", organizationId: principal.organizationId, resourceType: "run", resourceId: result.runId, data: { action: result.policyAction, provider } });
    }
    return result.response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GATEWAY_EXECUTION_FAILED";
    if (["PROVIDER_CONNECTION_NOT_FOUND", "PROVIDER_CONNECTION_NOT_VERIFIED", "PROVIDER_CREDENTIAL_DECRYPTION_FAILED"].includes(message)) {
      await safeAlert({ eventType: "provider.connection_failed", organizationId: principal.organizationId, resourceType: "provider_connection", resourceId: parsed.data.providerConnectionId, data: { provider, reason: message } });
    }
    return reply({ error: message }, statusForError(message));
  }
}
