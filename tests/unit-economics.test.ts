import { describe, expect, it } from "vitest";
import {
  groupUnitEconomics,
  summarizeUnitEconomics,
  type EconomicLedgerRow,
} from "@/lib/finops/unit-economics";

const row = (overrides: Partial<EconomicLedgerRow> = {}): EconomicLedgerRow => ({
  occurredAt: new Date("2026-10-01T00:00:00Z"),
  role: "variable_cost",
  amountUsd: 1,
  organizationId: "org_1",
  productId: "product_1",
  customerId: "customer_1",
  planId: "pro",
  taskId: "task_1",
  provider: "openai",
  costPurpose: "paid_service",
  evidence: "provider_measured",
  ...overrides,
});

describe("revenue-aware unit economics", () => {
  it("subtracts processor fees and refunds exactly once from gross revenue", () => {
    const summary = summarizeUnitEconomics([
      row({ role: "gross_revenue", amountUsd: 100, costPurpose: null }),
      row({ role: "processor_fee", amountUsd: 3, costPurpose: null }),
      row({ role: "refund", amountUsd: 7, costPurpose: null }),
    ]);

    expect(summary.knownNetRevenueUsd).toBe(90);
    expect(summary.netRevenueUsd).toBe(90);
    expect(summary.knownOperatingProfitUsd).toBe(90);
  });

  it("keeps unknown monetary values unknown instead of coercing them to zero", () => {
    const summary = summarizeUnitEconomics([
      row({ role: "gross_revenue", amountUsd: 100, costPurpose: null }),
      row({ role: "processor_fee", amountUsd: null, costPurpose: null }),
      row({ role: "variable_cost", amountUsd: null, costPurpose: "paid_service" }),
    ]);

    expect(summary.knownNetRevenueUsd).toBe(100);
    expect(summary.netRevenueUsd).toBeNull();
    expect(summary.contributionProfitUsd).toBeNull();
    expect(summary.operatingProfitUsd).toBeNull();
    expect(summary.unknownRevenueRows).toBe(1);
    expect(summary.unknownCostRows).toBe(1);
    expect(summary.incompleteReasons).toContain("unknown_net_revenue_components");
  });

  it("separates contribution margin from acquisition, R&D, free-trial and fixed overhead", () => {
    const summary = summarizeUnitEconomics([
      row({ role: "gross_revenue", amountUsd: 100, costPurpose: null }),
      row({ role: "variable_cost", amountUsd: 20, costPurpose: "paid_service" }),
      row({ role: "variable_cost", amountUsd: 5, costPurpose: "free_trial" }),
      row({ role: "variable_cost", amountUsd: 10, costPurpose: "acquisition" }),
      row({ role: "variable_cost", amountUsd: 15, costPurpose: "rd_testing" }),
      row({ role: "fixed_cost", amountUsd: 10, costPurpose: "fixed_overhead" }),
    ]);

    expect(summary.contributionProfitUsd).toBe(80);
    expect(summary.contributionMarginPct).toBe(80);
    expect(summary.operatingProfitUsd).toBe(40);
    expect(summary.operatingMarginPct).toBe(40);
    expect(summary.costByPurpose.acquisition.knownCostUsd).toBe(10);
    expect(summary.costByPurpose.rd_testing.knownCostUsd).toBe(15);
  });

  it("refuses to claim complete contribution margin while shared variable cost is unallocated", () => {
    const summary = summarizeUnitEconomics([
      row({ role: "gross_revenue", amountUsd: 100, costPurpose: null }),
      row({ role: "variable_cost", amountUsd: 15, costPurpose: "shared", customerId: null }),
    ]);

    expect(summary.knownContributionProfitUsd).toBe(100);
    expect(summary.contributionProfitUsd).toBeNull();
    expect(summary.operatingProfitUsd).toBe(85);
    expect(summary.ambiguousContributionRows).toBe(1);
    expect(summary.incompleteReasons).toContain("ambiguous_shared_or_unclassified_variable_costs");
  });

  it("groups customer economics deterministically and preserves unassigned rows", () => {
    const grouped = groupUnitEconomics(
      [
        row({ role: "gross_revenue", amountUsd: 50, customerId: "customer_b", costPurpose: null }),
        row({ role: "gross_revenue", amountUsd: 70, customerId: "customer_a", costPurpose: null }),
        row({ role: "variable_cost", amountUsd: 9, customerId: null, costPurpose: "shared" }),
      ],
      "customer",
    );

    expect(grouped.map((group) => group.key)).toEqual(["customer_a", "customer_b", "unassigned"]);
    expect(grouped.find((group) => group.key === "customer_a")?.netRevenueUsd).toBe(70);
    expect(grouped.find((group) => group.key === "unassigned")?.knownOperatingCostUsd).toBe(9);
  });

  it("rejects negative or non-finite ledger magnitudes", () => {
    expect(() => summarizeUnitEconomics([row({ amountUsd: -1 })])).toThrow(RangeError);
    expect(() => summarizeUnitEconomics([row({ amountUsd: Number.NaN })])).toThrow(RangeError);
  });

  it("does not manufacture an infinite margin when net revenue is zero", () => {
    const summary = summarizeUnitEconomics([
      row({ role: "gross_revenue", amountUsd: 10, costPurpose: null }),
      row({ role: "refund", amountUsd: 10, costPurpose: null }),
    ]);

    expect(summary.netRevenueUsd).toBe(0);
    expect(summary.contributionProfitUsd).toBe(0);
    expect(summary.contributionMarginPct).toBeNull();
    expect(summary.operatingMarginPct).toBeNull();
  });
});
