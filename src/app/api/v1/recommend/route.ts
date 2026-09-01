import * as z from "zod";
import { recommendCheapestPermitted } from "@/lib/economics/estimates";

const schema = z.object({
  inputTokens: z.number().int().nonnegative().max(10_000_000),
  outputTokens: z.number().int().nonnegative().max(10_000_000),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  requestsPerMonth: z.number().int().nonnegative().optional(),
  minimumContextWindow: z.number().int().positive().optional(),
  allowedModelIds: z.array(z.string()).min(1).max(100).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const recommendation = recommendCheapestPermitted(parsed.data);
  if (!recommendation) return Response.json({ error: "NO_MODEL_SATISFIES_CONSTRAINTS" }, { status: 422, headers: { "Cache-Control": "no-store" } });
  return Response.json({
    data: recommendation,
    basis: [
      "model is in the caller-provided allowlist when one is supplied",
      "combined input and planned output fit the published context window",
      "candidate has the lowest calculated request cost among eligible models",
    ],
    qualityGuarantee: false,
    usageSource: "estimated",
    warning: "This is an economics/context recommendation, not a measured quality ranking.",
  }, { headers: { "Cache-Control": "no-store" } });
}
