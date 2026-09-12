import { POST as governedGatewayPost } from "@/app/api/gateway/[provider]/route";
import { asInternalGatewayRequest, normalizeCompatibilityRequest } from "@/lib/gateway/compat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const normalized = normalizeCompatibilityRequest(request, await request.json().catch(() => null), { provider: "openai", surface: "responses" });
  if (!normalized.ok) return Response.json(normalized, { status: normalized.status, headers: { "Cache-Control": "no-store" } });
  return governedGatewayPost(asInternalGatewayRequest(request, normalized.body), { params: Promise.resolve({ provider: "openai" }) });
}
