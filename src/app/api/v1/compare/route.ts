import * as z from "zod";
import { compareScenarios } from "@/lib/economics/estimates";

const scenario = z.object({
  inputTokens: z.number().int().nonnegative().max(10_000_000),
  outputTokens: z.number().int().nonnegative().max(10_000_000),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  cacheWrite5mTokens: z.number().int().nonnegative().optional(),
  cacheWrite1hTokens: z.number().int().nonnegative().optional(),
  requestsPerMonth: z.number().int().nonnegative().optional(),
  modelIds: z.array(z.string()).max(100).optional(),
  minimumContextWindow: z.number().int().positive().optional(),
});
const schema = z.object({ a: scenario, b: scenario });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400, headers: { "Cache-Control": "no-store" } });
  return Response.json({
    data: compareScenarios(parsed.data.a, parsed.data.b),
    usageSource: "estimated",
    outcomeVerified: false,
    warning: "A lower-cost prompt is not considered an optimization win until task outcome quality is verified separately.",
  }, { headers: { "Cache-Control": "no-store" } });
}
