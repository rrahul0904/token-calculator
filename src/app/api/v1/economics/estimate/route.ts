import { consumePublicRateLimit } from "@/lib/http/public-rate-limit";
import { resolveScenarioEstimate } from "@/lib/economics/workload";
import { workloadScenarioSchema } from "@/lib/economics/schemas";

export async function POST(request: Request) {
  const rate = consumePublicRateLimit(request, "economics-estimate");
  if (!rate.allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429, headers: { ...rate.headers, "Cache-Control": "no-store" } });
  const parsed = workloadScenarioSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400, headers: { ...rate.headers, "Cache-Control": "no-store" } });
  const estimate = resolveScenarioEstimate(parsed.data);
  if (!estimate) return Response.json({ error: "MODEL_NOT_FOUND" }, { status: 404, headers: { ...rate.headers, "Cache-Control": "no-store" } });
  return Response.json({ data: estimate, usageSource: "estimated", qualityGuarantee: false }, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}