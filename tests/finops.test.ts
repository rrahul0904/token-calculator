import { describe, expect, it } from "vitest";
import { allocateShowback, buildWeeklyBrief, forecastMonthEnd, reconcileProviderSpend, type FinanceLedgerRow } from "@/lib/finops/finance";

const row = (overrides: Partial<FinanceLedgerRow> = {}): FinanceLedgerRow => ({
  occurredAt: new Date("2026-09-01T00:00:00Z"),
  costUsd: 1,
  status: "completed",
  outcomeStatus: "success",
  organizationId: "org_1",
  provider: "openai",
  projectId: "project_1",
  costCenter: "R&D",
  ...overrides,
});

describe("FinOps finance core", () => {
  it("allocates showback without converting unknown cost to zero", () => {
    const groups = allocateShowback([row({ costUsd: 2 }), row({ costUsd: null }), row({ provider: "anthropic", costUsd: 3 })], "provider");
    const openai = groups.find((group) => group.key === "openai");
    expect(openai?.knownSpendUsd).toBe(2);
    expect(openai?.unknownCostRows).toBe(1);
  });

  it("forecasts month end with explicit confidence and variance", () => {
    const forecast = forecastMonthEnd({ spendToDateUsd: 100, observedDays: 10, daysInMonth: 30, budgetUsd: 250 });
    expect(forecast.projectedMonthEndUsd).toBe(300);
    expect(forecast.varianceUsd).toBe(50);
    expect(forecast.confidence).toBe("low");
  });

  it("keeps reconciliation gaps visible", () => {
    expect(reconcileProviderSpend({ providerAccountSpendUsd: 100, attributedRunSpendUsd: 80 })).toEqual({ providerAccountSpendUsd: 100, attributedRunSpendUsd: 80, unattributedDifferenceUsd: 20, reconciliationCoveragePct: 80 });
    expect(reconcileProviderSpend({ providerAccountSpendUsd: null, attributedRunSpendUsd: 80 }).reconciliationCoveragePct).toBeNull();
  });

  it("generates deterministic weekly briefing metrics", () => {
    const brief = buildWeeklyBrief({
      current: [row({ costUsd: 10, retryCount: 2, fallbackPremiumUsd: 1, cacheReadTokens: 900, freshInputTokens: 100 }), row({ costUsd: 3, status: "failed" })],
      previous: [row({ costUsd: 8 })],
      anomalyCount: 2,
      budgetRisks: [{ name: "project", utilizationPct: 90 }],
      verifiedSavingsUsd: 4,
    });
    expect(brief.generatedBy).toBe("deterministic_finops_brief");
    expect(brief.periodSpendUsd).toBe(13);
    expect(brief.failedAbortedSpendUsd).toBe(3);
    expect(brief.verifiedSavingsUsd).toBe(4);
  });
});
