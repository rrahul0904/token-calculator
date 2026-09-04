const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const PER_TOKEN_TO_PER_MILLION = 1_000_000;

export interface OpenRouterNormalizedEndpoint {
  id: string;
  canonicalModelId: string;
  inferenceProvider: "OpenRouter";
  externalModelId: string;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  pricing: {
    input: number | null;
    cachedInput: number | null;
    cacheWrite: number | null;
    output: number | null;
  };
  sourceUrl: string;
  observedAt: string;
  name: string;
}

function moneyPerMillion(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed * PER_TOKEN_TO_PER_MILLION;
}

function canonicalId(externalModelId: string) {
  const slug = externalModelId.split("/").at(-1) ?? externalModelId;
  return slug.replace(/:(?:free|batch)$/u, "");
}

export function normalizeOpenRouterPayload(payload: unknown, observedAt = new Date().toISOString()): OpenRouterNormalizedEndpoint[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("OPENROUTER_INVALID_PAYLOAD");
  }
  const rows = (payload as { data: unknown[] }).data.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") return [];
    const pricing = row.pricing && typeof row.pricing === "object" ? row.pricing as Record<string, unknown> : {};
    const topProvider = row.top_provider && typeof row.top_provider === "object" ? row.top_provider as Record<string, unknown> : {};
    const contextLength = typeof row.context_length === "number" && Number.isFinite(row.context_length) ? Math.round(row.context_length) : null;
    const maxOutput = typeof topProvider.max_completion_tokens === "number" && Number.isFinite(topProvider.max_completion_tokens)
      ? Math.round(topProvider.max_completion_tokens)
      : null;
    return [{
      id: `openrouter:${row.id}`,
      canonicalModelId: canonicalId(row.id),
      inferenceProvider: "OpenRouter" as const,
      externalModelId: row.id,
      contextWindow: contextLength,
      maxOutputTokens: maxOutput,
      pricing: {
        input: moneyPerMillion(pricing.prompt),
        cachedInput: moneyPerMillion(pricing.input_cache_read),
        cacheWrite: moneyPerMillion(pricing.input_cache_write),
        output: moneyPerMillion(pricing.completion),
      },
      sourceUrl: `https://openrouter.ai/${row.id}`,
      observedAt,
      name: row.name,
    }];
  });
  if (rows.length === 0) throw new Error("OPENROUTER_EMPTY_CATALOG");
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error("OPENROUTER_DUPLICATE_MODEL_ID");
    ids.add(row.id);
  }
  return rows;
}

export async function fetchOpenRouterCatalog(apiKey: string, fetchImpl: typeof fetch = fetch) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY_NOT_CONFIGURED");
  const response = await fetchImpl(OPENROUTER_MODELS_URL, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OPENROUTER_HTTP_${response.status}`);
  return normalizeOpenRouterPayload(await response.json());
}
