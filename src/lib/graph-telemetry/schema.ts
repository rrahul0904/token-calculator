import * as z from "zod";

export const graphRoutingClassSchema = z.enum([
  "reasoning",
  "decision",
  "deterministic_tool",
]);

export const graphNodeTerminalStatusSchema = z.enum([
  "succeeded",
  "failed",
  "blocked",
  "skipped",
  "cancelled",
  "policy_blocked",
  "exhausted",
  "yielded",
]);

export const graphUsageSourceSchema = z.enum(["measured", "estimated"]);

export const graphTokenUsageSchema = z.object({
  freshInputTokens: z.number().int().nonnegative().default(0),
  cacheReadTokens: z.number().int().nonnegative().default(0),
  cacheWriteTokens: z.number().int().nonnegative().default(0),
  reasoningTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
});

export const graphDependencySchema = z.object({
  nodeExecutionId: z.string().min(1).max(240),
  status: graphNodeTerminalStatusSchema,
});

export const graphArtifactRefSchema = z.object({
  type: z.string().min(1).max(120),
  reference: z.string().min(1).max(2_000),
  digest: z.string().min(1).max(240).nullable().optional(),
});

export const graphPolicyDecisionSchema = z.object({
  decisionId: z.string().min(1).max(240).nullable().optional(),
  action: z.enum(["allow", "warn", "require_approval", "block", "kill"]),
  reason: z.string().min(1).max(2_000),
});

export const graphNodeExecutionSchema = z.object({
  graphRunId: z.string().min(1).max(240),
  graphVersion: z.string().min(1).max(120),
  nodeExecutionId: z.string().min(1).max(240),
  nodeId: z.string().min(1).max(240),
  nodeType: z.string().min(1).max(120),
  parentNodeExecutionId: z.string().min(1).max(240).nullable().optional(),
  groupId: z.string().min(1).max(240).nullable().optional(),
  iteration: z.number().int().nonnegative().nullable().optional(),
  routingClass: graphRoutingClassSchema,
  provider: z.string().min(1).max(120).nullable().optional(),
  model: z.string().min(1).max(240).nullable().optional(),
  usage: graphTokenUsageSchema.default({
    freshInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    outputTokens: 0,
  }),
  usageSource: graphUsageSourceSchema.default("estimated"),
  costUsd: z.number().nonnegative().nullable().optional(),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  handoffReason: z.string().min(1).max(2_000).nullable().optional(),
  terminalStatus: graphNodeTerminalStatusSchema,
  dependencies: z.array(graphDependencySchema).max(200).default([]),
  artifacts: z.array(graphArtifactRefSchema).max(200).default([]),
  policyDecisions: z.array(graphPolicyDecisionSchema).max(100).default([]),
  outcomeId: z.string().min(1).max(240).nullable().optional(),
});

export const graphRunReceiptSchema = z
  .object({
    schemaVersion: z.literal("1"),
    runId: z.string().min(1).max(240),
    graphRunId: z.string().min(1).max(240),
    graphVersion: z.string().min(1).max(120),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable().optional(),
    terminalStatus: graphNodeTerminalStatusSchema,
    plannerTurns: z.number().int().nonnegative(),
    nodes: z.array(graphNodeExecutionSchema).min(1).max(10_000),
  })
  .superRefine((receipt, ctx) => {
    const seen = new Set<string>();

    for (const [index, node] of receipt.nodes.entries()) {
      if (node.graphRunId !== receipt.graphRunId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", index, "graphRunId"],
          message: "node graphRunId must match receipt graphRunId",
        });
      }

      if (node.graphVersion !== receipt.graphVersion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", index, "graphVersion"],
          message: "node graphVersion must match receipt graphVersion",
        });
      }

      if (seen.has(node.nodeExecutionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", index, "nodeExecutionId"],
          message: "nodeExecutionId must be unique within a graph receipt",
        });
      }

      seen.add(node.nodeExecutionId);
    }

    for (const [index, node] of receipt.nodes.entries()) {
      for (const dependency of node.dependencies) {
        if (dependency.nodeExecutionId === node.nodeExecutionId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", index, "dependencies"],
            message: "a node cannot depend on itself",
          });
        } else if (!seen.has(dependency.nodeExecutionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", index, "dependencies"],
            message: `unknown dependency nodeExecutionId: ${dependency.nodeExecutionId}`,
          });
        }
      }
    }
  });

export type GraphRunReceipt = z.infer<typeof graphRunReceiptSchema>;

export interface GraphReceiptSummary {
  graphRunId: string;
  nodeCount: number;
  routingClassCounts: Record<z.infer<typeof graphRoutingClassSchema>, number>;
  terminalStatusCounts: Partial<Record<z.infer<typeof graphNodeTerminalStatusSchema>, number>>;
  totalTokens: number;
  totalCostUsd: number;
  measuredCostUsd: number;
  estimatedCostUsd: number;
  observedNodeLatencyMs: number;
  retries: number;
}

export function summarizeGraphReceipt(receipt: GraphRunReceipt): GraphReceiptSummary {
  const parsed = graphRunReceiptSchema.parse(receipt);

  const routingClassCounts: GraphReceiptSummary["routingClassCounts"] = {
    reasoning: 0,
    decision: 0,
    deterministic_tool: 0,
  };
  const terminalStatusCounts: GraphReceiptSummary["terminalStatusCounts"] = {};

  let totalTokens = 0;
  let totalCostUsd = 0;
  let measuredCostUsd = 0;
  let estimatedCostUsd = 0;
  let observedNodeLatencyMs = 0;
  let retries = 0;

  for (const node of parsed.nodes) {
    routingClassCounts[node.routingClass] += 1;
    terminalStatusCounts[node.terminalStatus] =
      (terminalStatusCounts[node.terminalStatus] ?? 0) + 1;

    const nodeTokens =
      node.usage.freshInputTokens +
      node.usage.cacheReadTokens +
      node.usage.cacheWriteTokens +
      node.usage.reasoningTokens +
      node.usage.outputTokens;
    totalTokens += nodeTokens;

    const cost = node.costUsd ?? 0;
    totalCostUsd += cost;
    if (node.usageSource === "measured") {
      measuredCostUsd += cost;
    } else {
      estimatedCostUsd += cost;
    }

    observedNodeLatencyMs += node.latencyMs ?? 0;
    retries += node.retryCount;
  }

  return {
    graphRunId: parsed.graphRunId,
    nodeCount: parsed.nodes.length,
    routingClassCounts,
    terminalStatusCounts,
    totalTokens,
    totalCostUsd,
    measuredCostUsd,
    estimatedCostUsd,
    observedNodeLatencyMs,
    retries,
  };
}

export interface GraphSavingsComparison {
  verified: boolean;
  reason:
    | "verified"
    | "outcome_not_equivalent"
    | "candidate_not_cheaper"
    | "insufficient_cost_evidence";
  savingsUsd: number | null;
  savingsPct: number | null;
}

export function compareGraphEconomics(input: {
  baselineCostUsd: number | null;
  candidateCostUsd: number | null;
  outcomeEquivalent: boolean;
}): GraphSavingsComparison {
  if (input.baselineCostUsd === null || input.candidateCostUsd === null || input.baselineCostUsd <= 0) {
    return {
      verified: false,
      reason: "insufficient_cost_evidence",
      savingsUsd: null,
      savingsPct: null,
    };
  }

  if (!input.outcomeEquivalent) {
    return {
      verified: false,
      reason: "outcome_not_equivalent",
      savingsUsd: null,
      savingsPct: null,
    };
  }

  if (input.candidateCostUsd >= input.baselineCostUsd) {
    return {
      verified: false,
      reason: "candidate_not_cheaper",
      savingsUsd: null,
      savingsPct: null,
    };
  }

  const savingsUsd = input.baselineCostUsd - input.candidateCostUsd;
  return {
    verified: true,
    reason: "verified",
    savingsUsd,
    savingsPct: (savingsUsd / input.baselineCostUsd) * 100,
  };
}
