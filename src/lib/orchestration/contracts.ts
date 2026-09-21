import * as z from "zod";
import { actionRiskSchema } from "@/lib/policy/schemas";

export const orchestrationRoleSchema = z.enum(["planner", "executor", "reviewer"]);
export const orchestrationRouteDecisionSchema = z.enum([
  "plan",
  "delegate_with_premium_review",
  "premium_only",
  "review",
  "review_correction",
]);

export const orchestrationRouteSelectorSchema = z.object({
  providerConnectionId: z.string().min(8).max(180),
  model: z.string().trim().min(1).max(200),
});

export const orchestrationProfileSchema = z.object({
  id: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(160),
  plannerRoute: orchestrationRouteSelectorSchema,
  executorRoute: orchestrationRouteSelectorSchema,
  reviewerRoute: orchestrationRouteSelectorSchema,
  maxCorrectionCycles: z.number().int().min(0).max(10).default(1),
  maxParallelWriters: z.number().int().min(1).max(32).default(1),
  requireExactRoute: z.boolean().default(true),
  riskEscalation: z.array(actionRiskSchema).max(4).default(["high", "critical"]),
});

export const orchestrationTaskBundleSchema = z.object({
  taskId: z.string().trim().min(2).max(180),
  objective: z.string().trim().min(1).max(8_000),
  allowedPaths: z.array(z.string().trim().min(1).max(500)).max(200).optional(),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(2_000)).min(1).max(100),
  verificationCommands: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
  dependencyTaskIds: z.array(z.string().trim().min(2).max(180)).max(100).optional(),
  riskClass: actionRiskSchema,
});

export const orchestrationGatewayContextSchema = z.object({
  orchestrationRunId: z.string().trim().min(8).max(180),
  taskId: z.string().trim().min(2).max(180),
  role: orchestrationRoleSchema,
  correctionCycle: z.number().int().min(0).max(10).default(0),
  routeDecision: orchestrationRouteDecisionSchema,
  expectedProviderConnectionId: z.string().min(8).max(180),
  expectedModel: z.string().trim().min(1).max(200),
  requireExactRoute: z.boolean().default(true),
  evidenceRequired: z.boolean().default(true),
  experimentId: z.string().trim().min(2).max(180).optional(),
  experimentVariant: z.enum(["baseline", "candidate"]).optional(),
}).superRefine((value, ctx) => {
  if ((value.experimentId === undefined) !== (value.experimentVariant === undefined)) {
    ctx.addIssue({
      code: "custom",
      message: "experimentId and experimentVariant must be supplied together.",
      path: value.experimentId === undefined ? ["experimentId"] : ["experimentVariant"],
    });
  }

  const allowedDecisions = value.role === "planner"
    ? ["plan"]
    : value.role === "executor"
      ? ["delegate_with_premium_review"]
      : ["review", "premium_only", "review_correction"];
  if (!allowedDecisions.includes(value.routeDecision)) {
    ctx.addIssue({
      code: "custom",
      message: `routeDecision ${value.routeDecision} is not valid for role ${value.role}.`,
      path: ["routeDecision"],
    });
  }
});

export const executorEvidenceSchema = z.object({
  taskId: z.string().trim().min(2).max(180),
  route: z.object({
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(200),
    resolvedBy: z.enum(["explicit", "policy"]),
  }),
  changedPaths: z.array(z.string().trim().min(1).max(500)).max(500),
  verification: z.array(z.object({
    command: z.string().trim().min(1).max(2_000),
    exitCode: z.number().int().nullable(),
    resultSummary: z.string().trim().min(1).max(4_000),
  })).max(100),
  risks: z.array(z.string().trim().min(1).max(2_000)).max(100),
  status: z.enum(["ready_for_review", "blocked", "failed"]),
  usageReceiptIds: z.array(z.string().trim().min(1).max(180)).max(500),
}).superRefine((value, ctx) => {
  if (value.status === "ready_for_review" && value.usageReceiptIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["usageReceiptIds"],
      message: "Ready-for-review evidence requires at least one authoritative usage receipt.",
    });
  }
});

export type OrchestrationProfile = z.infer<typeof orchestrationProfileSchema>;
export type OrchestrationTaskBundle = z.infer<typeof orchestrationTaskBundleSchema>;
export type OrchestrationGatewayContext = z.infer<typeof orchestrationGatewayContextSchema>;
export type ExecutorEvidence = z.infer<typeof executorEvidenceSchema>;
export type OrchestrationRole = z.infer<typeof orchestrationRoleSchema>;

export interface OrchestrationRouteResolution {
  role: OrchestrationRole;
  route: z.infer<typeof orchestrationRouteSelectorSchema>;
  decision: z.infer<typeof orchestrationRouteDecisionSchema>;
  requireExactRoute: boolean;
  requiresPremiumReview: boolean;
  reason: string;
}

export function resolveOrchestrationRoute(args: {
  profile: OrchestrationProfile;
  task: OrchestrationTaskBundle;
  role: OrchestrationRole;
  correctionCycle?: number;
}): OrchestrationRouteResolution {
  const correctionCycle = args.correctionCycle ?? 0;

  if (args.role === "planner") {
    return {
      role: "planner",
      route: args.profile.plannerRoute,
      decision: "plan",
      requireExactRoute: args.profile.requireExactRoute,
      requiresPremiumReview: false,
      reason: "Planner work stays on the configured planner route.",
    };
  }

  if (args.role === "reviewer") {
    return {
      role: "reviewer",
      route: args.profile.reviewerRoute,
      decision: "review",
      requireExactRoute: args.profile.requireExactRoute,
      requiresPremiumReview: false,
      reason: "Review work stays on the configured reviewer route.",
    };
  }

  if (correctionCycle > args.profile.maxCorrectionCycles) {
    return {
      role: "reviewer",
      route: args.profile.reviewerRoute,
      decision: "review_correction",
      requireExactRoute: args.profile.requireExactRoute,
      requiresPremiumReview: false,
      reason: "Executor correction budget was exhausted; escalation is fail closed to the reviewer route.",
    };
  }

  if (args.profile.riskEscalation.includes(args.task.riskClass)) {
    return {
      role: "reviewer",
      route: args.profile.reviewerRoute,
      decision: "premium_only",
      requireExactRoute: args.profile.requireExactRoute,
      requiresPremiumReview: false,
      reason: `${args.task.riskClass} risk work is configured for premium-only execution.`,
    };
  }

  return {
    role: "executor",
    route: args.profile.executorRoute,
    decision: "delegate_with_premium_review",
    requireExactRoute: args.profile.requireExactRoute,
    requiresPremiumReview: true,
    reason: "The task is eligible for the lower-cost executor and still requires premium acceptance.",
  };
}

export function orchestrationReceiptMetadata(
  context: OrchestrationGatewayContext | undefined,
): Record<string, string> {
  if (!context) return {};
  return {
    "orchestration.run_id": context.orchestrationRunId,
    "orchestration.task_id": context.taskId,
    "orchestration.role": context.role,
    "orchestration.correction_cycle": String(context.correctionCycle),
    "orchestration.route_decision": context.routeDecision,
    "orchestration.expected_provider_connection_id": context.expectedProviderConnectionId,
    "orchestration.expected_model": context.expectedModel,
    "orchestration.require_exact_route": String(context.requireExactRoute),
    "orchestration.evidence_required": String(context.evidenceRequired),
    ...(context.experimentId ? {
      "orchestration.experiment_id": context.experimentId,
      "orchestration.experiment_variant": context.experimentVariant!,
    } : {}),
  };
}
