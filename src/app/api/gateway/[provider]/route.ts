import { isDatabaseConfigured } from "@/db/client";
import { authenticateApiKey } from "@/lib/auth/api-auth";
import { executeGovernedGateway, gatewayRequestSchema } from "@/lib/gateway/execute";
import type { GatewayProviderName } from "@/lib/gateway/provider-connectivity";
import { consumeGatewayRateLimit } from "@/lib/gateway/rate-limit";
import { isVaultConfigured } from "@/lib/security/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function reply(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
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

  // Fail closed: gateway enforcement is not trustworthy if the shared rate-limit state cannot be updated.
  try {
    const rate = await consumeGatewayRateLimit(principal.organizationId, principal.apiKeyId);
    if (!rate.allowed) return reply({ error: "RATE_LIMIT_EXCEEDED", limit: rate.limit, resetAt: rate.resetAt.toISOString() }, 429, {
      "x-ratelimit-limit": String(rate.limit),
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": rate.resetAt.toISOString(),
    });
  } catch {
    return reply({ error: "RATE_LIMIT_AUTHORITY_UNAVAILABLE" }, 503);
  }

  const { provider } = await context.params;
  if (!(["openai", "anthropic", "gemini"] as const).includes(provider as GatewayProviderName)) {
    return reply({ error: "PROVIDER_UNSUPPORTED", provider }, 404);
  }

  const parsed = gatewayRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  try {
    const result = await executeGovernedGateway(principal, parsed.data, provider as GatewayProviderName);
    return result.response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GATEWAY_EXECUTION_FAILED";
    return reply({ error: message }, statusForError(message));
  }
}
