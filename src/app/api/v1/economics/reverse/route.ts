import { modelForWorkload, solveTokensForBudget } from "@/lib/economics/workload";
import { workloadScenarioSchema } from "@/lib/economics/schemas";

export async function POST(request: Request) {
  const parsed = workloadScenarioSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const model = modelForWorkload(parsed.data.modelId);
  if (!model) return Response.json({ error: "MODEL_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const estimate = solveTokensForBudget(model, { ...parsed.data, mode: "cost2tokens" });
  if (!estimate) return Response.json({ error: "UNPRICED_WORKLOAD" }, { status: 422, headers: { "Cache-Control": "no-store" } });
  return Response.json({ data: estimate, usageSource: "estimated", solver: "piecewise_binary_search" }, { headers: { "Cache-Control": "no-store" } });
}