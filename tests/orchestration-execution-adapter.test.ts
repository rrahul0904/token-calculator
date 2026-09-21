import { describe, expect, it, vi } from "vitest";
import {
  buildOrchestrationExecutionAssignment,
  executeWithOrchestrationBackend,
} from "@/lib/orchestration/execution-adapter";
import { orchestrationProfileSchema, orchestrationTaskBundleSchema } from "@/lib/orchestration/contracts";

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

function task(riskClass: "low" | "high" = "low") {
  return orchestrationTaskBundleSchema.parse({
    taskId: `task-${riskClass}`,
    objective: "Implement the bounded slice.",
    acceptanceCriteria: ["Tests pass"],
    riskClass,
  });
}

describe("orchestration execution adapter", () => {
  it("builds a governed lower-cost executor assignment for eligible work", () => {
    const assignment = buildOrchestrationExecutionAssignment({
      orchestrationRunId: "orch_run_123",
      profile,
      task: task("low"),
      role: "executor",
      experiment: { id: "exp_123", variant: "candidate" },
    });

    expect(assignment).toMatchObject({
      providerConnectionId: "conn_executor",
      model: "cheap-model",
      orchestration: {
        role: "executor",
        routeDecision: "delegate_with_premium_review",
        requireExactRoute: true,
        experimentId: "exp_123",
        experimentVariant: "candidate",
      },
    });
  });

  it("moves high-risk executor work onto the reviewer route before backend execution", () => {
    const assignment = buildOrchestrationExecutionAssignment({
      orchestrationRunId: "orch_run_123",
      profile,
      task: task("high"),
      role: "executor",
    });

    expect(assignment).toMatchObject({
      providerConnectionId: "conn_premium",
      model: "premium-model",
      orchestration: {
        role: "reviewer",
        routeDecision: "premium_only",
      },
    });
  });

  it("passes only the governed assignment to a provider-neutral backend", async () => {
    const assignment = buildOrchestrationExecutionAssignment({
      orchestrationRunId: "orch_run_123",
      profile,
      task: task("low"),
      role: "executor",
    });
    const execute = vi.fn(async () => ({ status: "ok" }));
    const backend = { id: "test-backend", execute };

    await expect(executeWithOrchestrationBackend({
      backend,
      assignment,
      task: task("low"),
      input: { prompt: "do work" },
    })).resolves.toEqual({ status: "ok" });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      assignment: expect.objectContaining({
        providerConnectionId: "conn_executor",
        model: "cheap-model",
      }),
    }));
  });
});
