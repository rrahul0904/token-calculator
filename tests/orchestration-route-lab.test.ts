import { describe, expect, it } from "vitest";
import { summarizeOrchestrationEconomics } from "@/lib/orchestration/route-lab";

function call(overrides: Partial<Parameters<typeof summarizeOrchestrationEconomics>[0][number]> = {}) {
  return {
    id: "llm_1",
    runId: "run_1",
    costUsd: "0.10",
    costSource: "reconciled",
    startedAt: new Date("2026-09-20T00:00:00Z"),
    metadata: {
      "orchestration.run_id": "orch_12345",
      "orchestration.task_id": "task-a",
      "orchestration.role": "executor",
      "orchestration.correction_cycle": "0",
    },
    ...overrides,
  };
}

describe("Route Lab orchestration economics", () => {
  it("summarizes reconciled planner, executor, and reviewer receipts without inventing savings", () => {
    const result = summarizeOrchestrationEconomics([
      call({
        id: "planner",
        costUsd: "0.40",
        metadata: {
          "orchestration.run_id": "orch_12345",
          "orchestration.task_id": "task-a",
          "orchestration.role": "planner",
          "orchestration.correction_cycle": "0",
          "orchestration.experiment_id": "exp_1",
        },
      }),
      call({ id: "executor", costUsd: "0.10" }),
      call({
        id: "reviewer",
        costUsd: "0.30",
        startedAt: new Date("2026-09-20T00:01:00Z"),
        metadata: {
          "orchestration.run_id": "orch_12345",
          "orchestration.task_id": "task-a",
          "orchestration.role": "reviewer",
          "orchestration.correction_cycle": "1",
          "orchestration.experiment_id": "exp_1",
        },
      }),
    ]);

    expect(result.runCount).toBe(1);
    expect(result.callCount).toBe(3);
    expect(result.taskCount).toBe(1);
    expect(result.reconciledRunCount).toBe(1);
    expect(result.reconciledTotalCostUsd).toBeCloseTo(0.8);
    expect(result.executorCostShare).toBeCloseTo(0.125);
    expect(result.premiumCostShare).toBeCloseTo(0.875);
    expect(result.runs[0]).toMatchObject({
      taskCount: 1,
      experimentCount: 1,
      correctionCycles: 1,
      planner: { callCount: 1, costUsd: 0.4 },
      executor: { callCount: 1, costUsd: 0.1 },
      reviewer: { callCount: 1, costUsd: 0.3 },
      totalCostUsd: 0.8,
      evidence: "reconciled",
    });
  });

  it("fails total and role cost closed when an orchestration receipt lacks authoritative cost", () => {
    const result = summarizeOrchestrationEconomics([
      call(),
      call({
        id: "reviewer",
        costUsd: "0.25",
        costSource: "estimated",
        metadata: {
          "orchestration.run_id": "orch_12345",
          "orchestration.task_id": "task-a",
          "orchestration.role": "reviewer",
          "orchestration.correction_cycle": "0",
        },
      }),
    ]);

    expect(result.runs[0].executor.costUsd).toBe(0.1);
    expect(result.runs[0].reviewer.costUsd).toBeNull();
    expect(result.runs[0].totalCostUsd).toBeNull();
    expect(result.runs[0].evidence).toBe("unavailable");
    expect(result.reconciledRunCount).toBe(0);
    expect(result.reconciledTotalCostUsd).toBeNull();
  });

  it("ignores ordinary gateway calls and invalid orchestration roles", () => {
    const result = summarizeOrchestrationEconomics([
      call({ metadata: {} }),
      call({
        id: "bad-role",
        metadata: {
          "orchestration.run_id": "orch_12345",
          "orchestration.role": "worker",
        },
      }),
    ]);
    expect(result.runCount).toBe(0);
    expect(result.callCount).toBe(0);
  });
});
