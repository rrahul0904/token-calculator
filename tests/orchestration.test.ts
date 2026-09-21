import { describe, expect, it } from "vitest";
import { gatewayRequestSchema } from "@/lib/gateway/execute";
import {
  executorEvidenceSchema,
  orchestrationProfileSchema,
  orchestrationReceiptMetadata,
  orchestrationTaskBundleSchema,
  resolveOrchestrationRoute,
} from "@/lib/orchestration/contracts";

const profile = orchestrationProfileSchema.parse({
  id: "thin-root",
  name: "Thin root",
  plannerRoute: { providerConnectionId: "conn_premium", model: "premium-model" },
  executorRoute: { providerConnectionId: "conn_executor", model: "cheap-model" },
  reviewerRoute: { providerConnectionId: "conn_premium", model: "premium-model" },
  maxCorrectionCycles: 1,
  requireExactRoute: true,
  riskEscalation: ["high", "critical"],
});

const lowRiskTask = orchestrationTaskBundleSchema.parse({
  taskId: "task-low",
  objective: "Implement a bounded repository change.",
  acceptanceCriteria: ["Tests pass"],
  riskClass: "low",
});

describe("thin-root orchestration contracts", () => {
  it("routes eligible executor work to the configured lower-cost route with premium review", () => {
    expect(resolveOrchestrationRoute({ profile, task: lowRiskTask, role: "executor" })).toMatchObject({
      role: "executor",
      route: profile.executorRoute,
      decision: "delegate_with_premium_review",
      requireExactRoute: true,
      requiresPremiumReview: true,
    });
  });

  it("escalates high-risk execution to the reviewer route", () => {
    const highRiskTask = orchestrationTaskBundleSchema.parse({
      ...lowRiskTask,
      taskId: "task-high",
      riskClass: "high",
    });
    expect(resolveOrchestrationRoute({ profile, task: highRiskTask, role: "executor" })).toMatchObject({
      role: "reviewer",
      route: profile.reviewerRoute,
      decision: "premium_only",
    });
  });

  it("fails closed to reviewer after the configured correction budget", () => {
    expect(resolveOrchestrationRoute({
      profile,
      task: lowRiskTask,
      role: "executor",
      correctionCycle: 2,
    })).toMatchObject({
      role: "reviewer",
      route: profile.reviewerRoute,
      decision: "review_correction",
    });
  });

  it("requires usage receipts in executor evidence", () => {
    expect(executorEvidenceSchema.safeParse({
      taskId: "task-low",
      route: { provider: "openai", model: "cheap-model", resolvedBy: "explicit" },
      changedPaths: ["src/example.ts"],
      verification: [{ command: "npm test", exitCode: 0, resultSummary: "passed" }],
      risks: [],
      status: "ready_for_review",
      usageReceiptIds: [],
    }).success).toBe(false);
  });

  it("allows zero receipts when execution is blocked before a provider call", () => {
    expect(executorEvidenceSchema.safeParse({
      taskId: "task-low",
      route: { provider: "openai", model: "cheap-model", resolvedBy: "explicit" },
      changedPaths: [],
      verification: [],
      risks: ["required executor route unavailable"],
      status: "blocked",
      usageReceiptIds: [],
    }).success).toBe(true);
  });

  it("rejects inconsistent orchestration role and route-decision metadata", () => {
    expect(gatewayRequestSchema.safeParse({
      providerConnectionId: "conn_executor",
      model: "cheap-model",
      input: "hello",
      orchestration: {
        orchestrationRunId: "orch_run_123",
        taskId: "task-low",
        role: "executor",
        routeDecision: "review",
        expectedProviderConnectionId: "conn_executor",
        expectedModel: "cheap-model",
        requireExactRoute: true,
      },
    }).success).toBe(false);
  });

  it("rejects fallback or route mismatch when exact orchestration routing is required", () => {
    const base = {
      providerConnectionId: "conn_executor",
      model: "cheap-model",
      input: "hello",
      orchestration: {
        orchestrationRunId: "orch_run_123",
        taskId: "task-low",
        role: "executor",
        routeDecision: "delegate_with_premium_review",
        expectedProviderConnectionId: "conn_executor",
        expectedModel: "cheap-model",
        requireExactRoute: true,
      },
    } as const;

    expect(gatewayRequestSchema.safeParse({ ...base, fallbackModel: "premium-model" }).success).toBe(false);
    expect(gatewayRequestSchema.safeParse({ ...base, model: "different-model" }).success).toBe(false);
    expect(gatewayRequestSchema.safeParse(base).success).toBe(true);
  });

  it("emits experiment attribution without creating a parallel savings ledger", () => {
    expect(orchestrationReceiptMetadata({
      orchestrationRunId: "orch_run_123",
      taskId: "task-low",
      role: "executor",
      correctionCycle: 0,
      routeDecision: "delegate_with_premium_review",
      expectedProviderConnectionId: "conn_executor",
      expectedModel: "cheap-model",
      requireExactRoute: true,
      evidenceRequired: true,
      experimentId: "exp_123",
      experimentVariant: "candidate",
    })).toMatchObject({
      "orchestration.role": "executor",
      "orchestration.task_id": "task-low",
      "orchestration.experiment_id": "exp_123",
      "orchestration.experiment_variant": "candidate",
    });
  });
});
