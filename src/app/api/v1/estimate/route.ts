import * as z from "zod";
import { estimateAcrossModels } from "@/lib/economics/estimates";
import { PROVIDERS } from "@/lib/models";

const schema = z.object({
  inputTokens: z.number().int().nonnegative().max(10_000_000),
  outputTokens: z.number().int().nonnegative().max(10_000_000),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  cacheWrite5mTokens: z.number().int().nonnegative().optional(),
  cacheWrite1hTokens: z.number().int().nonnegative().optional(),
  requestsPerMonth: z.number().int().nonnegative().max(10_000_000_000).optional(),
  providers: z.array(z.enum(PROVIDERS as [typeof PROVIDERS[number], ...typeof PROVIDERS[number][]])).optional(),
  modelIds: z.array(z.string()).max(100).optional(),
  minimumContextWindow: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const estimates = estimateAcrossModels(parsed.data).sort((a, b) => a.requestCostUsd - b.requestCostUsd);
  return Response.json({
    data: estimates,
    usageSource: "estimated",
    note: "Costs use the current verified catalog and are planning estimates until provider-native usage is reconciled.",
  }, { headers: { "Cache-Control": "no-store" } });
}
