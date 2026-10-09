import { describe, expect, it } from "vitest";

import { portfolioAnalysisInput } from "@/lib/mcp/portfolio-schema";

describe("unified portfolio MCP schema", () => {
  it("accepts the three final native capability families through the unified entrypoint", () => {
    const parsed = portfolioAnalysisInput.parse({
      requests: [
        {
          kind: "prompt_cache_economics",
          candidate: {
            id: "cache-policy",
            evidenceType: "measured_before_after",
            qualityGate: "passed",
            cacheAccountingGate: "verified",
            sampleSize: 10,
            baselineCostUsd: 10,
            candidateCostUsd: 6,
          },
        },
        {
          kind: "budget_control",
          candidate: {
            id: "budget-policy",
            evidenceType: "measured_before_after",
            qualityGate: "passed",
            enforcementGate: "verified",
            sampleSize: 10,
            budgetLimitUsd: 8,
            baselineCostUsd: 10,
            candidateCostUsd: 6,
          },
        },
        {
          kind: "orchestration_efficiency",
          candidate: {
            id: "bounded-agents",
            evidenceType: "measured_before_after",
            qualityGate: "passed",
            provenanceGate: "verified",
            sampleSize: 10,
            baselineSessionTokens: 20_000,
            candidateWorkerTokens: 10_000,
            coordinatorTokens: 2_000,
            observedMaxFanout: 3,
            maxAllowedFanout: 4,
          },
        },
      ],
    });

    expect(parsed.requests.map((request) => request.kind)).toEqual([
      "prompt_cache_economics",
      "budget_control",
      "orchestration_efficiency",
    ]);
  });

  it("rejects unknown optimization kinds instead of silently bypassing evidence gates", () => {
    const parsed = portfolioAnalysisInput.safeParse({
      requests: [{ kind: "magic_optimizer", candidate: { id: "unsafe" } }],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects hidden fields at the metadata-only MCP boundary", () => {
    const parsed = portfolioAnalysisInput.safeParse({
      requests: [{
        kind: "budget_control",
        candidate: {
          id: "budget-policy",
          evidenceType: "measured_before_after",
          qualityGate: "passed",
          enforcementGate: "verified",
          sampleSize: 10,
          budgetLimitUsd: 8,
          baselineCostUsd: 10,
          candidateCostUsd: 6,
          prompt: "do not accept prompt content here",
        },
      }],
    });

    expect(parsed.success).toBe(false);
  });
});
