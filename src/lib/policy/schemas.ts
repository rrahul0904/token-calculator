import * as z from "zod";

export const actionRiskSchema = z.enum(["low", "medium", "high", "critical"]);
const actionCategorySchema = z.string().trim().min(1).max(120).transform((value) => value.toLowerCase());

export const scopeTypeSchema = z.enum(["organization", "team", "project", "environment", "user", "service_account", "api_key", "agent", "workflow", "run"]);

export const policyRulesSchema = z.object({
  maxCostUsd: z.number().nonnegative().optional(),
  warnCostUsd: z.number().nonnegative().optional(),
  maxTokens: z.number().int().nonnegative().optional(),
  maxTurns: z.number().int().nonnegative().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  maxFailedToolCalls: z.number().int().nonnegative().optional(),
  maxToolCalls: z.number().int().nonnegative().optional(),
  maxElapsedMs: z.number().int().nonnegative().optional(),
  maxProviderRounds: z.number().int().nonnegative().optional(),
  maxResultBytes: z.number().int().nonnegative().optional(),
  maxContextUtilizationPct: z.number().min(0).max(100).optional(),
  allowedProviders: z.array(z.string().min(1).max(120)).max(30).optional(),
  allowedModels: z.array(z.string().min(1).max(200)).max(200).optional(),
  fallbackPremiumApprovalUsd: z.number().nonnegative().optional(),
  disableFallback: z.boolean().optional(),
  maxAutonomousActionRisk: actionRiskSchema.optional(),
  approvalActionCategories: z.array(actionCategorySchema).max(50).optional(),
  blockedActionCategories: z.array(actionCategorySchema).max(50).optional(),
}).refine((rules) => rules.warnCostUsd === undefined || rules.maxCostUsd === undefined || rules.warnCostUsd <= rules.maxCostUsd, {
  message: "warnCostUsd must not exceed maxCostUsd",
});

export const createPolicySchema = z.object({
  name: z.string().trim().min(2).max(120),
  scopeType: scopeTypeSchema,
  scopeId: z.string().max(180).nullable().optional(),
  priority: z.number().int().min(1).max(10_000).default(100),
  enabled: z.boolean().default(true),
  rules: policyRulesSchema,
});

export const createBudgetSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scopeType: scopeTypeSchema,
  scopeId: z.string().max(180).nullable().optional(),
  period: z.enum(["run", "day", "week", "month"]).default("run"),
  limitUsd: z.number().positive().optional(),
  tokenLimit: z.number().int().positive().optional(),
  warnAtPct: z.number().min(1).max(100).default(80),
  hardStop: z.boolean().default(false),
  enabled: z.boolean().default(true),
}).refine((value) => value.limitUsd !== undefined || value.tokenLimit !== undefined, { message: "At least one budget limit is required." });

export const policyCheckSchema = z.object({
  projectId: z.string().max(180).nullable().optional(),
  environment: z.string().max(80).optional(),
  userId: z.string().max(180).optional(),
  serviceAccountId: z.string().max(180).optional(),
  apiKeyId: z.string().max(180).optional(),
  agent: z.string().max(160).optional(),
  workflow: z.string().max(160).optional(),
  runId: z.string().max(180).optional(),
  observedCostUsd: z.number().nonnegative().default(0),
  projectedNextCallCostUsd: z.number().nonnegative().optional(),
  tokens: z.number().int().nonnegative().default(0),
  turns: z.number().int().nonnegative().default(0),
  retries: z.number().int().nonnegative().default(0),
  failedToolCalls: z.number().int().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0),
  elapsedMs: z.number().int().nonnegative().default(0),
  providerRounds: z.number().int().nonnegative().default(0),
  resultBytes: z.number().int().nonnegative().default(0),
  contextUtilizationPct: z.number().min(0).max(100).optional(),
  provider: z.string().max(120).optional(),
  model: z.string().max(200).optional(),
  fallbackPremiumUsd: z.number().nonnegative().optional(),
  isFallback: z.boolean().optional(),
  actionRisk: actionRiskSchema.optional(),
  actionCategory: actionCategorySchema.optional(),
  actionName: z.string().trim().min(1).max(240).optional(),
});
