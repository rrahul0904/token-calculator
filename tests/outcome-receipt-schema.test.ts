import { describe, expect, it } from "vitest";
import { outcomeReceiptSchema } from "@/lib/telemetry/schemas";

describe("outcome receipt schema", () => {
  it("accepts stable CI and deployment identity without retaining deployment content", () => {
    const parsed = outcomeReceiptSchema.parse({
      runId: "run_12345678",
      status: "deployed",
      taskCompleted: true,
      testsPassed: true,
      commitSha: "37d7f96c6fd82e048d3f596af3be7eeb62ff2e5d",
      prNumber: 24,
      ciPassed: true,
      ciProvider: "github_actions",
      ciRunId: "35304030865",
      merged: true,
      deploymentSuccessful: true,
      deploymentProvider: "vercel",
      deploymentId: "dpl_example_123",
      deploymentEnvironment: "production",
      deployedAt: "2026-09-18T03:39:34Z",
      associationConfidence: 0.98,
      metadata: { source: "release-certification" },
    });

    expect(parsed.ciRunId).toBe("35304030865");
    expect(parsed.deploymentId).toBe("dpl_example_123");
    expect(parsed.deployedAt).toBeInstanceOf(Date);
  });

  it("rejects empty stable identity values", () => {
    expect(() => outcomeReceiptSchema.parse({
      runId: "run_12345678",
      status: "completed",
      ciProvider: "",
    })).toThrow();
  });
});
