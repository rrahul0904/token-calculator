import * as z from "zod";

export const usageSourceSchema = z.enum([
  "provider_measured",
  "agent_measured",
  "local_tokenizer_reference",
  "estimated",
  "reconciled",
]);

export const runStatusSchema = z.enum(["queued", "running", "completed", "failed", "aborted", "cancelled", "budget_blocked"]);
export const turnStatusSchema = z.enum(["running", "completed", "aborted", "compacted", "failed"]);

const nullableMoney = z.number().finite().nonnegative().nullable().optional();
const nullableCount = z.number().int().nonnegative().nullable().optional();
const metadataSchema = z.record(z.string(), z.unknown()).default({});

export const runReceiptSchema = z.object({
  id: z.string().min(8).max(180),
  projectId: z.string().nullable().optional(),
  environment: z.string().min(1).max(80).default("development"),
  developerUserId: z.string().nullable().optional(),
  serviceAccountId: z.string().nullable().optional(),
  agentName: z.string().min(1).max(120),
  agentVendor: z.string().max(120).nullable().optional(),
  agentVersion: z.string().max(120).nullable().optional(),
  workflowName: z.string().max(160).nullable().optional(),
  workflowVersion: z.string().max(120).nullable().optional(),
  repo: z.string().max(500).nullable().optional(),
  branch: z.string().max(300).nullable().optional(),
  repoCommitSha: z.string().max(80).nullable().optional(),
  issueOrTicketId: z.string().max(160).nullable().optional(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable().optional(),
  status: runStatusSchema.default("running"),
  terminationReason: z.string().max(500).nullable().optional(),
  estimatedCostUsd: nullableMoney,
  actualCostUsd: nullableMoney,
  reconciledCostUsd: nullableMoney,
  budgetLimitUsd: nullableMoney,
  freshInputTokens: z.number().int().nonnegative().default(0),
  cacheReadTokens: z.number().int().nonnegative().default(0),
  cacheWriteTokens: z.number().int().nonnegative().default(0),
  reasoningTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  toolCallCount: z.number().int().nonnegative().default(0),
  retryCount: z.number().int().nonnegative().default(0),
  fallbackCount: z.number().int().nonnegative().default(0),
  turnCount: z.number().int().nonnegative().default(0),
  finalArtifactType: z.string().max(120).nullable().optional(),
  finalArtifactReference: z.string().max(1000).nullable().optional(),
  outcomeStatus: z.string().max(80).nullable().optional(),
  outcomeScore: z.number().finite().nullable().optional(),
  usageSource: usageSourceSchema.default("estimated"),
  metadata: metadataSchema,
});

export const turnReceiptSchema = z.object({
  id: z.string().min(8).max(180),
  runId: z.string().min(8).max(180),
  turnIndex: z.number().int().nonnegative(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable().optional(),
  status: turnStatusSchema,
  modelRequested: z.string().max(200).nullable().optional(),
  modelResolved: z.string().max(200).nullable().optional(),
  reasoningEffort: z.string().max(80).nullable().optional(),
  freshInputTokens: z.number().int().nonnegative().default(0),
  cacheReadTokens: z.number().int().nonnegative().default(0),
  cacheWriteTokens: z.number().int().nonnegative().default(0),
  reasoningTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  costUsd: nullableMoney,
  toolCallCount: z.number().int().nonnegative().default(0),
  retryCount: z.number().int().nonnegative().default(0),
  fallbackCount: z.number().int().nonnegative().default(0),
  latencyMs: nullableCount,
  timeToFirstTokenMs: nullableCount,
  contextTokensBefore: nullableCount,
  contextTokensAfter: nullableCount,
  contextUtilizationPct: z.number().min(0).max(100).nullable().optional(),
  usageSource: usageSourceSchema.default("estimated"),
  metadata: metadataSchema,
});

export const llmCallReceiptSchema = z.object({
  id: z.string().min(8).max(180),
  runId: z.string().min(8).max(180),
  turnId: z.string().max(180).nullable().optional(),
  provider: z.string().min(1).max(120),
  modelRequested: z.string().max(200).nullable().optional(),
  modelResolved: z.string().max(200).nullable().optional(),
  providerRequestId: z.string().max(300).nullable().optional(),
  freshInputTokens: nullableCount,
  cacheReadTokens: nullableCount,
  cacheWriteTokens: nullableCount,
  audioInputTokens: nullableCount,
  imageInputUnits: nullableCount,
  searchUnits: nullableCount,
  reasoningTokens: nullableCount,
  outputTokens: nullableCount,
  costUsd: nullableMoney,
  costSource: usageSourceSchema.default("estimated"),
  pricingVersion: z.string().max(160).nullable().optional(),
  serviceTier: z.string().max(120).nullable().optional(),
  latencyMs: nullableCount,
  timeToFirstTokenMs: nullableCount,
  statusCode: z.number().int().min(100).max(599).nullable().optional(),
  attemptIndex: z.number().int().nonnegative().default(0),
  fallbackFromCallId: z.string().max(180).nullable().optional(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable().optional(),
  metadata: metadataSchema,
});

export const toolCallReceiptSchema = z.object({
  id: z.string().min(8).max(180),
  runId: z.string().min(8).max(180),
  turnId: z.string().max(180).nullable().optional(),
  parentLlmCallId: z.string().max(180).nullable().optional(),
  toolName: z.string().min(1).max(240),
  toolCategory: z.enum(["shell", "filesystem", "search", "mcp", "browser", "database", "other"]).default("other"),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable().optional(),
  status: z.string().min(1).max(80),
  attemptIndex: z.number().int().nonnegative().default(0),
  inputSizeBytes: nullableCount,
  outputSizeBytes: nullableCount,
  outputTokensEstimated: nullableCount,
  isRetry: z.boolean().default(false),
  resourceHash: z.string().max(180).nullable().optional(),
  metadata: metadataSchema,
});

export const outcomeReceiptSchema = z.object({
  runId: z.string().min(8).max(180),
  status: z.string().min(1).max(80),
  score: z.number().finite().nullable().optional(),
  taskCompleted: z.boolean().nullable().optional(),
  testsPassed: z.boolean().nullable().optional(),
  commitSha: z.string().max(80).nullable().optional(),
  prNumber: z.number().int().positive().nullable().optional(),
  ciPassed: z.boolean().nullable().optional(),
  merged: z.boolean().nullable().optional(),
  deploymentSuccessful: z.boolean().nullable().optional(),
  associationConfidence: z.number().min(0).max(1).nullable().optional(),
  metadata: metadataSchema,
});

export const budgetDecisionReceiptSchema = z.object({
  runId: z.string().max(180).nullable().optional(),
  policyId: z.string().max(180).nullable().optional(),
  action: z.enum(["ALLOW", "WARN", "NOTIFY", "REQUIRE_APPROVAL", "DISABLE_FALLBACK", "BLOCK_NEXT_CALL", "KILL_RUN"]),
  reason: z.string().min(1).max(1000),
  projectedCostUsd: nullableMoney,
  observedCostUsd: nullableMoney,
  decisionData: metadataSchema,
  decidedAt: z.coerce.date().default(() => new Date()),
});

export const telemetryEventSchema = z.object({
  sourceEventId: z.string().min(1).max(240),
  source: z.string().min(1).max(120),
  eventType: z.enum(["run.upsert", "turn.upsert", "llm_call.recorded", "tool_call.recorded", "outcome.recorded", "budget_decision.recorded"]),
  occurredAt: z.coerce.date(),
  projectId: z.string().max(180).nullable().optional(),
  runId: z.string().max(180).nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
});

// MCP tool schemas are converted to JSON Schema for tools/list. Keep this
// boundary deliberately transport-only: Zod Date values cannot be represented
// in JSON Schema, while an RFC 3339 datetime string can. The regular telemetry
// schema above remains the domain contract used by HTTP ingestion and storage.
export const mcpTelemetryEventSchema = z.object({
  sourceEventId: z.string().min(1).max(240),
  source: z.string().min(1).max(120),
  eventType: z.enum(["run.upsert", "turn.upsert", "llm_call.recorded", "tool_call.recorded", "outcome.recorded", "budget_decision.recorded"]),
  occurredAt: z.string().datetime({ offset: true }),
  projectId: z.string().max(180).nullable().optional(),
  runId: z.string().max(180).nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const telemetryBatchSchema = z.object({
  events: z.array(telemetryEventSchema).min(1).max(500),
});

export type RunReceiptInput = z.infer<typeof runReceiptSchema>;
export type TurnReceiptInput = z.infer<typeof turnReceiptSchema>;
export type LlmCallReceiptInput = z.infer<typeof llmCallReceiptSchema>;
export type ToolCallReceiptInput = z.infer<typeof toolCallReceiptSchema>;
export type TelemetryEventInput = z.infer<typeof telemetryEventSchema>;
export type McpTelemetryEventInput = z.infer<typeof mcpTelemetryEventSchema>;

/**
 * Convert the JSON-compatible MCP transport shape into the existing internal
 * telemetry contract only after the wire schema has accepted it.
 */
export function parseMcpTelemetryEvent(input: unknown): TelemetryEventInput {
  const event = mcpTelemetryEventSchema.parse(input);
  return telemetryEventSchema.parse({ ...event, occurredAt: new Date(event.occurredAt) });
}
