import * as z from "zod";

export const wireAttributionCategorySchema = z.enum([
  "system_prompt",
  "tool_schema",
  "user_content",
  "assistant_content",
  "tool_result",
  "reasoning",
  "output",
]);

export const wireAttributionSpanSchema = z.object({
  spanRef: z.string().min(1).max(120),
  category: wireAttributionCategorySchema,
  tokens: z.number().int().nonnegative().nullable(),
  cacheState: z.enum(["fresh", "read", "write", "unknown"]).default("unknown"),
  confidence: z.enum(["measured", "estimated", "unknown"]),
  serverRef: z.string().min(1).max(120).optional(),
  toolRef: z.string().min(1).max(120).optional(),
  invoked: z.boolean().nullable().optional(),
}).strict();

const providerUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative().nullable(),
}).strict();

export const wireAttributionReceiptSchema = z.object({
  schemaVersion: z.literal("1"),
  captureMode: z.enum(["imported_metadata", "explicit_local_capture"]),
  modelRef: z.string().min(1).max(200),
  pricingVersion: z.string().min(1).max(120).nullable(),
  contextWindowTokens: z.number().int().positive().nullable(),
  providerUsage: providerUsageSchema,
  spans: z.array(wireAttributionSpanSchema).min(1).max(10_000),
  privacy: z.object({
    redactedBeforePersistence: z.literal(true),
    rawContentPersisted: z.literal(false),
    retention: z.literal("metadata_only"),
  }).strict(),
}).strict();

export type WireAttributionReceipt = z.infer<typeof wireAttributionReceiptSchema>;

export interface WireAttributionReconciliation {
  valid: boolean;
  reason: "reconciled" | "incomplete_usage" | "duplicate_usage" | "unattributed_delta";
  contextOccupancyTokens: number | null;
  inputDeltaTokens: number | null;
  outputDeltaTokens: number | null;
  cache: { freshTokens: number; readTokens: number; writeTokens: number; unknownTokens: number };
  mcp: {
    toolSchemas: number;
    invokedTools: number;
    unusedTools: number;
    invocationEvidenceComplete: boolean;
  };
}

const sumKnown = (values: Array<number | null>): number | null => values.some((value) => value === null)
  ? null
  : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

/** Analyze redacted metadata only. Capture adapters should catch failures and continue provider requests. */
export function reconcileWireAttribution(input: unknown): WireAttributionReconciliation {
  const receipt = wireAttributionReceiptSchema.parse(input);
  const spanRefs = receipt.spans.map((span) => span.spanRef);
  const hasInput = receipt.providerUsage.inputTokens > 0;
  const hasOutput = receipt.providerUsage.outputTokens > 0;
  const duplicateUsage = new Set(spanRefs).size !== spanRefs.length;
  const inputTokens = sumKnown(receipt.spans
    .filter((span) => span.category !== "output" && span.category !== "reasoning")
    .map((span) => span.tokens));
  const outputTokens = sumKnown(receipt.spans.filter((span) => span.category === "output").map((span) => span.tokens));
  const reasoning = sumKnown(receipt.spans.filter((span) => span.category === "reasoning").map((span) => span.tokens));
  const incomplete = (hasInput && inputTokens === null) || (hasOutput && outputTokens === null)
    || (receipt.providerUsage.reasoningTokens !== null && reasoning === null);
  const inputDeltaTokens = inputTokens === null ? null : receipt.providerUsage.inputTokens - inputTokens;
  const outputDeltaTokens = outputTokens === null ? null : receipt.providerUsage.outputTokens - outputTokens;
  const valid = !duplicateUsage && !incomplete && inputDeltaTokens === 0 && outputDeltaTokens === 0
    && (receipt.providerUsage.reasoningTokens === null || reasoning === receipt.providerUsage.reasoningTokens);
  const cache = { freshTokens: 0, readTokens: 0, writeTokens: 0, unknownTokens: 0 };
  for (const span of receipt.spans) {
    if (span.tokens === null || span.category === "output" || span.category === "reasoning") continue;
    if (span.cacheState === "fresh") cache.freshTokens += span.tokens;
    else if (span.cacheState === "read") cache.readTokens += span.tokens;
    else if (span.cacheState === "write") cache.writeTokens += span.tokens;
    else cache.unknownTokens += span.tokens;
  }
  const toolSchemas = receipt.spans.filter((span) => span.category === "tool_schema");
  const invocationEvidenceComplete = toolSchemas.every((span) => span.invoked !== null && span.invoked !== undefined);
  const invokedTools = toolSchemas.filter((span) => span.invoked === true).length;
  return {
    valid,
    reason: duplicateUsage ? "duplicate_usage" : incomplete ? "incomplete_usage" : valid ? "reconciled" : "unattributed_delta",
    contextOccupancyTokens: sumKnown(receipt.spans.map((span) => span.tokens)),
    inputDeltaTokens,
    outputDeltaTokens,
    cache,
    mcp: {
      toolSchemas: toolSchemas.length,
      invokedTools,
      unusedTools: invocationEvidenceComplete ? toolSchemas.length - invokedTools : 0,
      invocationEvidenceComplete,
    },
  };
}

export function captureWireAttributionSafely<T>(capture: () => T): T | null {
  try {
    return capture();
  } catch {
    return null;
  }
}
