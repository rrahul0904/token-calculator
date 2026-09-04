import { consumePublicRateLimit } from "@/lib/http/public-rate-limit";
import * as z from "zod";
import { MODEL_CATALOG } from "@/lib/models";
import { compareWithPinned, modelForWorkload } from "@/lib/economics/workload";
import { workloadScenarioSchema } from "@/lib/economics/schemas";

const schema = z.object({
  scenario: workloadScenarioSchema,
  baselineModelId: z.string().min(1).max(180).optional(),
  candidateModelIds: z.array(z.string().min(1).max(180)).max(100).optional(),
});

export async function POST(request: Request) {
  const rate = consumePublicRateLimit(request, "economics-compare");
  if (!rate.allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429, headers: { ...rate.headers, "Cache-Control": "no-store" } });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400, headers: { ...rate.headers, "Cache-Control": "no-store" } });
  const baselineId = parsed.data.baselineModelId ?? parsed.data.scenario.pinnedModelId ?? parsed.data.scenario.modelId;
  const baseline = modelForWorkload(baselineId);
  if (!baseline) return Response.json({ error: "BASELINE_MODEL_NOT_FOUND" }, { status: 404, headers: { ...rate.headers, "Cache-Control": "no-store" } });
  const wanted = parsed.data.candidateModelIds ? new Set(parsed.data.candidateModelIds) : null;
  const candidates = MODEL_CATALOG.filter((model) => model.status !== "legacy" && (!wanted || wanted.has(model.id)));
  return Response.json({
    data: candidates.map((candidate) => compareWithPinned(baseline, candidate, parsed.data.scenario)),
    qualityGuarantee: false,
    warning: "Economic alternatives are not capability-equivalence claims. Quality requires separate evidence.",
  }, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}