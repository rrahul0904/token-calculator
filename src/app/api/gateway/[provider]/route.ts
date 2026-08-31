import { isDatabaseConfigured } from "@/db/client";
import { authenticateApiKey } from "@/lib/auth/api-auth";
import { executeGovernedGateway, gatewayRequestSchema } from "@/lib/gateway/execute";
import { isVaultConfigured } from "@/lib/security/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function statusForError(message: string) {
  if (message === "GATEWAY_ENTITLEMENT_REQUIRED") return 402;
  if (message === "PROJECT_SCOPE_VIOLATION") return 403;
  if (message === "PROJECT_NOT_FOUND" || message === "PROVIDER_CONNECTION_NOT_FOUND") return 404;
  if (message === "PROVIDER_UNSUPPORTED") return 400;
  if (message === "ORGANIZATION_NOT_FOUND") return 404;
  if (message === "ENCRYPTION_KEY_NOT_CONFIGURED" || message === "ENCRYPTION_KEY_INVALID_LENGTH") return 503;
  return 500;
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  if (!isVaultConfigured()) return reply({ error: "CREDENTIAL_VAULT_NOT_CONFIGURED" }, 503);
  const principal = await authenticateApiKey(request, "gateway:invoke");
  if (!principal) return reply({ error: "UNAUTHORIZED", requiredScope: "gateway:invoke" }, 401);

  const { provider } = await context.params;
  if (!(["openai", "anthropic", "gemini"] as const).includes(provider as "openai" | "anthropic" | "gemini")) {
    return reply({ error: "PROVIDER_UNSUPPORTED", provider }, 404);
  }

  const parsed = gatewayRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  try {
    const result = await executeGovernedGateway(principal, parsed.data);
    const responseProvider = parsed.data.providerConnectionId;
    void responseProvider;
    return result.response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GATEWAY_EXECUTION_FAILED";
    return reply({ error: message }, statusForError(message));
  }
}
