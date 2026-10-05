import * as z from "zod";
import {
  captureWireAttributionSafely,
  reconcileWireAttribution,
  wireAttributionReceiptSchema,
  wireAttributionSpanSchema,
  type WireAttributionReceipt,
} from "@/lib/telemetry/wire-attribution";

const providerSchema = z.enum(["openai", "anthropic", "google"]);
const metadataSpanSchema = wireAttributionSpanSchema;
const redactionReceiptSchema = z.object({
  redactedBeforePersistence: z.literal(true),
  rawContentPersisted: z.literal(false),
  classification: z.literal("key_name_heuristic"),
  credentialFieldsDiscarded: z.number().int().nonnegative().max(10_000),
  contentFieldsDiscarded: z.number().int().nonnegative().max(10_000),
  retention: z.literal("metadata_only"),
}).strict();

const localRequestEventSchema = z.object({
  provider: z.string().min(1).max(80),
  request: z.record(z.string(), z.unknown()),
  response: z.record(z.string(), z.unknown()),
  contextWindowTokens: z.number().int().positive().nullable().optional(),
  spans: z.array(metadataSpanSchema).max(10_000).optional(),
  mcpTools: z.array(z.object({
    serverRef: z.string().min(1).max(120),
    toolRef: z.string().min(1).max(120),
    tokens: z.number().int().nonnegative().nullable(),
    invoked: z.boolean().nullable(),
  }).strict()).max(2_000).optional(),
}).strict();

export type LocalRequestEventInput = z.input<typeof localRequestEventSchema>;

export interface RedactionReceipt {
  redactedBeforePersistence: true;
  rawContentPersisted: false;
  classification: "key_name_heuristic";
  credentialFieldsDiscarded: number;
  contentFieldsDiscarded: number;
  retention: "metadata_only";
}

export interface LocalCostXrayRecord {
  provider: z.infer<typeof providerSchema>;
  receipt: WireAttributionReceipt;
  redaction: RedactionReceipt;
  analysis: ReturnType<typeof analyzeCostXrayReceipt>;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function readCount(...values: unknown[]): number | null {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null);
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid provider usage metadata");
  return value;
}

function normalizeProvider(value: string): z.infer<typeof providerSchema> {
  const provider = value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  if (["openai", "azureopenai", "openaicompatible"].includes(provider)) return "openai";
  if (["anthropic", "claude"].includes(provider)) return "anthropic";
  if (["google", "googleai", "gemini", "googlevertexai", "vertexai"].includes(provider)) return "google";
  throw new Error("Unsupported provider metadata adapter");
}

function normalizeModelRef(value: unknown, provider: z.infer<typeof providerSchema>): string {
  if (typeof value !== "string" || value.length > 120 || !/^(?:gpt|o[1-9]|chatgpt|claude|gemini|gemma|models\/)[a-z0-9._:/-]+$/i.test(value)) {
    throw new Error("Invalid model metadata");
  }
  return `${provider}:${value}`;
}

function classifyDiscardedFields(value: unknown): Omit<RedactionReceipt, "redactedBeforePersistence" | "rawContentPersisted" | "classification" | "retention"> {
  const counts = { credentialFieldsDiscarded: 0, contentFieldsDiscarded: 0 };
  const seen = new Set<object>();
  const credentialKey = /authorization|api[_-]?key|secret|(?:^|[_-])(?:access|refresh|auth)?[_-]?token(?:$|[_-])|cookie|password|credential/i;
  const contentKey = /prompt|content|text|messages?|tool[_-]?(?:input|output|result|schema)|transcript|(?:^|[_-])(?:system|input|output)(?:$|[_-])/i;
  const usageMetadataKey = /(?:^|[_-])tokens?(?:[_-]|$)|tokencount/i;
  let inspectedKeys = 0;
  const inspect = (input: unknown, depth: number): void => {
    if (depth > 12 || input === null || typeof input !== "object" || seen.has(input)) return;
    seen.add(input);
    for (const key in input) {
      if (!Object.hasOwn(input, key)) continue;
      if (inspectedKeys >= 10_000) return;
      inspectedKeys += 1;
      const nested = (input as UnknownRecord)[key];
      if (!usageMetadataKey.test(key)) {
        if (credentialKey.test(key)) counts.credentialFieldsDiscarded = Math.min(10_000, counts.credentialFieldsDiscarded + 1);
        else if (contentKey.test(key)) counts.contentFieldsDiscarded = Math.min(10_000, counts.contentFieldsDiscarded + 1);
      }
      if (nested !== null && typeof nested === "object") inspect(nested, depth + 1);
    }
  };
  inspect(value, 0);
  return counts;
}

function normalizeUsage(provider: z.infer<typeof providerSchema>, response: UnknownRecord) {
  const usage = asRecord(response.usage ?? response.usageMetadata);
  if (provider === "openai") {
    const inputTokens = readCount(usage.input_tokens, usage.prompt_tokens);
    const outputTokens = readCount(usage.output_tokens, usage.completion_tokens);
    const details = asRecord(usage.input_tokens_details ?? usage.prompt_tokens_details);
    const completionDetails = asRecord(usage.completion_tokens_details);
    const cachedTokens = readCount(details.cached_tokens) ?? 0;
    const reasoningTokens = readCount(completionDetails.reasoning_tokens);
    if (inputTokens === null || outputTokens === null || cachedTokens > inputTokens) throw new Error("Incomplete provider usage metadata");
    return { inputTokens, outputTokens, reasoningTokens, cachedTokens, cacheWriteTokens: 0 };
  }
  if (provider === "anthropic") {
    const baseInput = readCount(usage.input_tokens);
    const outputTokens = readCount(usage.output_tokens);
    const cachedTokens = readCount(usage.cache_read_input_tokens) ?? 0;
    const cacheWriteTokens = readCount(usage.cache_creation_input_tokens) ?? 0;
    if (baseInput === null || outputTokens === null) throw new Error("Incomplete provider usage metadata");
    return {
      inputTokens: baseInput + cachedTokens + cacheWriteTokens,
      outputTokens,
      reasoningTokens: null,
      cachedTokens,
      cacheWriteTokens,
    };
  }
  const inputTokens = readCount(usage.promptTokenCount);
  const outputTokens = readCount(usage.candidatesTokenCount);
  const cachedTokens = readCount(usage.cachedContentTokenCount) ?? 0;
  const reasoningTokens = readCount(usage.thoughtsTokenCount);
  if (inputTokens === null || outputTokens === null || cachedTokens > inputTokens) throw new Error("Incomplete provider usage metadata");
  return { inputTokens, outputTokens, reasoningTokens, cachedTokens, cacheWriteTokens: 0 };
}

function makeReceipt(input: z.infer<typeof localRequestEventSchema>, provider: z.infer<typeof providerSchema>): WireAttributionReceipt {
  const usage = normalizeUsage(provider, input.response);
  const modelRef = normalizeModelRef(input.response.model ?? input.request.model, provider);

  const sourceSpans = input.spans ?? [];
  if (new Set(sourceSpans.map((span) => span.spanRef)).size !== sourceSpans.length) throw new Error("Duplicate attribution span metadata");
  const serverRefs = new Map<string, string>();
  const serverRefFor = (sourceRef: string) => {
    const existing = serverRefs.get(sourceRef);
    if (existing) return existing;
    const normalized = `mcp-server:${serverRefs.size + 1}`;
    serverRefs.set(sourceRef, normalized);
    return normalized;
  };
  const spans = sourceSpans.map((span, index) => {
    return {
      ...span,
      spanRef: `segment:${index + 1}`,
      ...(span.serverRef === undefined ? {} : { serverRef: serverRefFor(span.serverRef) }),
      ...(span.toolRef === undefined ? {} : { toolRef: `mcp-tool:${index + 1}` }),
    };
  });
  for (const [index, tool] of (input.mcpTools ?? []).entries()) {
    spans.push({
      spanRef: `mcp:${index + 1}`,
      category: "tool_schema",
      tokens: tool.tokens,
      cacheState: "unknown",
      confidence: tool.tokens === null ? "unknown" : "estimated",
      serverRef: serverRefFor(tool.serverRef),
      toolRef: `mcp-tool:${index + 1}`,
      invoked: tool.invoked,
    });
  }

  const inputSpans = spans.filter((span) => span.category !== "output" && span.category !== "reasoning");
  if (inputSpans.every((span) => span.tokens !== null)) {
    const attributed = inputSpans.reduce((sum, span) => sum + (span.tokens ?? 0), 0);
    if (attributed <= usage.inputTokens) {
      const attributedRead = inputSpans.filter((span) => span.cacheState === "read").reduce((sum, span) => sum + (span.tokens ?? 0), 0);
      const attributedWrite = inputSpans.filter((span) => span.cacheState === "write").reduce((sum, span) => sum + (span.tokens ?? 0), 0);
      const missingRead = usage.cachedTokens - attributedRead;
      const missingWrite = usage.cacheWriteTokens - attributedWrite;
      if (missingRead < 0 || missingWrite < 0) throw new Error("Cache spans exceed provider usage metadata");
      const freshTokens = usage.inputTokens - attributed - missingRead - missingWrite;
      if (freshTokens < 0) throw new Error("Cache metadata exceeds unattributed input");
      if (freshTokens > 0) spans.push({ spanRef: "provider:unattributed-input", category: "unattributed_input", tokens: freshTokens, cacheState: "fresh", confidence: "unknown" });
      if (missingRead > 0) spans.push({ spanRef: "provider:cache-read", category: "unattributed_input", tokens: missingRead, cacheState: "read", confidence: "measured" });
      if (missingWrite > 0) spans.push({ spanRef: "provider:cache-write", category: "unattributed_input", tokens: missingWrite, cacheState: "write", confidence: "measured" });
    }
  }

  const outputSpans = spans.filter((span) => span.category === "output");
  if (outputSpans.every((span) => span.tokens !== null)) {
    const attributedOutput = outputSpans.reduce((sum, span) => sum + (span.tokens ?? 0), 0);
    if (attributedOutput <= usage.outputTokens && usage.outputTokens > attributedOutput) {
      spans.push({ spanRef: "provider:unattributed-output", category: "output", tokens: usage.outputTokens - attributedOutput, cacheState: "unknown", confidence: "unknown" });
    }
  }
  if (usage.reasoningTokens !== null && !spans.some((span) => span.category === "reasoning")) {
    spans.push({ spanRef: "provider:reasoning", category: "reasoning", tokens: usage.reasoningTokens, cacheState: "unknown", confidence: "measured" });
  }
  if (spans.length === 0) spans.push({ spanRef: "provider:usage", category: "unattributed_input", tokens: 0, cacheState: "unknown", confidence: "unknown" });

  return wireAttributionReceiptSchema.parse({
    schemaVersion: "1",
    captureMode: "explicit_local_capture",
    modelRef,
    pricingVersion: null,
    contextWindowTokens: input.contextWindowTokens ?? null,
    providerUsage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens },
    spans,
    privacy: { redactedBeforePersistence: true, rawContentPersisted: false, retention: "metadata_only" },
  });
}

export function normalizeLocalRequestEvent(raw: unknown): Omit<LocalCostXrayRecord, "analysis"> {
  const input = localRequestEventSchema.parse(raw);
  const provider = normalizeProvider(input.provider);
  const receipt = makeReceipt(input, provider);
  return {
    provider,
    receipt,
    redaction: {
      redactedBeforePersistence: true,
      rawContentPersisted: false,
      classification: "key_name_heuristic",
      ...classifyDiscardedFields({ request: input.request, response: input.response }),
      retention: "metadata_only",
    },
  };
}

export function analyzeCostXrayReceipt(receipt: WireAttributionReceipt) {
  const reconciliation = reconcileWireAttribution(receipt);
  const inputTokens = receipt.providerUsage.inputTokens;
  const contextWindowTokens = receipt.contextWindowTokens;
  return {
    reconciliation,
    context: {
      occupiedTokens: inputTokens,
      windowTokens: contextWindowTokens,
      occupancyRatio: contextWindowTokens === null ? null : inputTokens / contextWindowTokens,
    },
    mcpOverhead: {
      schemaTokens: receipt.spans.filter((span) => span.category === "tool_schema").reduce((sum, span) => sum + (span.tokens ?? 0), 0),
      schemaTokensComplete: receipt.spans.filter((span) => span.category === "tool_schema").every((span) => span.tokens !== null),
      ...reconciliation.mcp,
    },
    cache: reconciliation.cache,
  };
}

export interface MetadataOnlyReceiptStore {
  append(record: LocalCostXrayRecord): void;
  list(): LocalCostXrayRecord[];
}

/** Process-local by default; the only accepted persisted shape contains validated metadata receipts. */
export function createMetadataOnlyReceiptStore(maxRecords = 500): MetadataOnlyReceiptStore {
  const capacity = z.number().int().min(1).max(10_000).parse(maxRecords);
  const records: LocalCostXrayRecord[] = [];
  return {
    append(record) {
      const receipt = wireAttributionReceiptSchema.parse(record.receipt);
      const redaction = redactionReceiptSchema.parse(record.redaction);
      if (records.length >= capacity) records.shift();
      records.push({
        provider: providerSchema.parse(record.provider),
        receipt,
        redaction,
        analysis: analyzeCostXrayReceipt(receipt),
      });
    },
    list: () => records.map((record) => structuredClone(record)),
  };
}

export function captureLocalRequestEventSafely(raw: unknown, store: MetadataOnlyReceiptStore): LocalCostXrayRecord | null {
  return captureWireAttributionSafely(() => {
    const normalized = normalizeLocalRequestEvent(raw);
    const record: LocalCostXrayRecord = { ...normalized, analysis: analyzeCostXrayReceipt(normalized.receipt) };
    store.append(record);
    return record;
  });
}
