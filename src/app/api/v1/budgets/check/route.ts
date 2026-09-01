import { isDatabaseConfigured } from "@/db/client";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { evaluateOrganizationPolicy } from "@/lib/policy/evaluate-db";
import { policyCheckSchema } from "@/lib/policy/schemas";

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const principal = await authenticateRequest(request, "read:budgets");
  if (!principal) return reply({ error: "UNAUTHORIZED" }, 401);
  const parsed = policyCheckSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  const check = parsed.data;
  if (principal.kind === "api_key" && principal.projectId && check.projectId && principal.projectId !== check.projectId) return reply({ error: "PROJECT_SCOPE_VIOLATION" }, 403);

  try {
    const result = await evaluateOrganizationPolicy(principal.organizationId, {
      ...check,
      apiKeyId: principal.kind === "api_key" ? principal.apiKeyId : check.apiKeyId,
      serviceAccountId: principal.kind === "api_key" ? principal.serviceAccountId ?? check.serviceAccountId : check.serviceAccountId,
      userId: principal.kind === "session" ? principal.tenant.internalUserId : check.userId,
    });
    return reply({ data: result.decision, enforcement: result.enforcement });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "POLICY_EVALUATION_FAILED" }, 400);
  }
}
