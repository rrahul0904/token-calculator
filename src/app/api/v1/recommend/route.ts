import * as z from "zod";
import { recommendCheapestPermitted, estimateAcrossModels } from "@/lib/economics/estimates";
import { MODEL_CATALOG } from "@/lib/models";

const providerSchema = z.enum(["OpenAI", "Anthropic", "Google", "xAI", "DeepSeek"]);
const schema = z.object({
  inputTokens: z.number().int().nonnegative().max(10_000_000),
  outputTokens: z.number().int().nonnegative().max(10_000_000),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  requestsPerMonth: z.number().int().nonnegative().optional(),
  minimumContextWindow: z.number().int().positive().optional(),
  allowedModelIds: z.array(z.string()).min(1).max(100).optional(),
  providers: z.array(providerSchema).min(1).max(5).optional(),
  minimumModelMaxOutput: z.number().int().positive().optional(),
  maximumLatencyMs: z.number().int().positive().optional(),
  minimumHistoricalSuccessRate: z.number().min(0).max(1).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const callerAllowlist = parsed.data.allowedModelIds ? new Set(parsed.data.allowedModelIds) : null;
  const capabilityAllowedIds = MODEL_CATALOG.filter((model) => {
    if (callerAllowlist && !callerAllowlist.has(model.id)) return false;
    if (parsed.data.providers?.length && !parsed.data.providers.includes(model.provider)) return false;
    if (parsed.data.minimumContextWindow && model.contextWindow < parsed.data.minimumContextWindow) return false;
    if (parsed.data.minimumModelMaxOutput && (model.maxOutput ?? 0) < parsed.data.minimumModelMaxOutput) return false;
    return true;
  }).map((model) => model.id);

  if (!capabilityAllowedIds.length) return Response.json({ error: "NO_MODEL_SATISFIES_CONSTRAINTS" }, { status: 422, headers: { "Cache-Control": "no-store" } });

  const baseRequest = {
    inputTokens: parsed.data.inputTokens,
    outputTokens: parsed.data.outputTokens,
    cachedInputTokens: parsed.data.cachedInputTokens,
    requestsPerMonth: parsed.data.requestsPerMonth,
    minimumContextWindow: parsed.data.minimumContextWindow,
    allowedModelIds: capabilityAllowedIds,
    providers: parsed.data.providers,
  };
  const candidates = estimateAcrossModels(baseRequest).filter((estimate) => estimate.fitsContext);
  const recommendation = recommendCheapestPermitted(baseRequest);
  if (!recommendation || !candidates.some((candidate) => candidate.modelId === recommendation.modelId)) return Response.json({ error: "NO_MODEL_SATISFIES_CONSTRAINTS" }, { status: 422, headers: { "Cache-Control": "no-store" } });
  const alternatives = candidates.filter((candidate) => candidate.modelId !== recommendation.modelId).sort((a, b) => a.requestCostUsd - b.requestCostUsd).slice(0, 5);
  const unevaluated = [
    parsed.data.maximumLatencyMs ? "maximumLatencyMs: no measured model latency catalog is available" : null,
    parsed.data.minimumHistoricalSuccessRate !== undefined ? "minimumHistoricalSuccessRate: historical cohort evidence is evaluated in Route Lab, not the static catalog" : null,
  ].filter((value): value is string => Boolean(value));
  return Response.json({
    data: recommendation,
    alternatives,
    basis: [
      "model is in the caller-provided allowlist when one is supplied",
      "provider is in the permitted set when one is supplied",
      "published context window satisfies the declared minimum and planned request",
      "published maximum output satisfies the declared minimum when one is supplied",
      "candidate has the lowest calculated request cost among eligible models",
    ],
    constraintsSatisfied: {
      allowedProviders: parsed.data.providers ?? null,
      allowedModels: parsed.data.allowedModelIds ?? null,
      minimumContextWindow: parsed.data.minimumContextWindow ?? null,
      minimumModelMaxOutput: parsed.data.minimumModelMaxOutput ?? null,
      plannedOutputTokens: parsed.data.outputTokens,
    },
    constraintsNotEvaluated: unevaluated,
    qualityGuarantee: false,
    usageSource: "estimated",
    warning: "This is an economics/context recommendation, not a measured quality ranking. Use Route Lab or experiments when outcome evidence is required.",
  }, { headers: { "Cache-Control": "no-store" } });
}
