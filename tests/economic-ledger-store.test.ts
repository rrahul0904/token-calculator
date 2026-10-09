import { describe, expect, it } from "vitest";
import { economicLedgerRowId, toEconomicLedgerInsert } from "@/lib/finops/economic-ledger-store";
import type { PersistableEconomicLine } from "@/lib/finops/economic-ledger-store";

const line = (overrides: Partial<PersistableEconomicLine> = {}): PersistableEconomicLine => ({
  sourceProvider: "stripe",
  sourceId: "charge:ch_1:gross",
  sourceCurrency: "USD",
  sourceAmountMinor: 10_000,
  row: {
    occurredAt: new Date("2026-10-09T12:00:00Z"),
    role: "gross_revenue",
    amountUsd: 100,
    organizationId: "org_1",
    productId: "product_1",
    customerId: "cus_1",
    planId: "pro",
    taskId: "task_1",
    provider: "stripe",
    costPurpose: null,
    evidence: "provider_measured",
  },
  metadata: { chargeId: "ch_1" },
  ...overrides,
});

describe("economic ledger persistence mapping", () => {
  it("derives a stable row identity from tenant + source provider + source id", () => {
    const first = line();
    const replay = line({ row: { ...line().row, amountUsd: 105 } });

    expect(economicLedgerRowId(first)).toBe(economicLedgerRowId(replay));
    expect(economicLedgerRowId(first)).toMatch(/^econ_[a-f0-9]{40}$/);
    expect(economicLedgerRowId(line({ sourceId: "charge:ch_2:gross" }))).not.toBe(economicLedgerRowId(first));
    expect(
      economicLedgerRowId(line({ row: { ...line().row, organizationId: "org_2" } })),
    ).not.toBe(economicLedgerRowId(first));
  });

  it("preserves provider-native money and attribution without inventing missing values", () => {
    const insert = toEconomicLedgerInsert(line());

    expect(insert).toMatchObject({
      organizationId: "org_1",
      sourceProvider: "stripe",
      sourceExternalId: "charge:ch_1:gross",
      sourceCurrency: "usd",
      sourceAmountMinor: "10000",
      economicRole: "gross_revenue",
      amountUsd: "100",
      productReference: "product_1",
      customerReference: "cus_1",
      planReference: "pro",
      taskReference: "task_1",
      provider: "stripe",
      costPurpose: null,
      evidence: "provider_measured",
      metadata: { chargeId: "ch_1" },
    });
  });

  it("keeps unknown normalized money and unknown provider-native money null", () => {
    const insert = toEconomicLedgerInsert(
      line({
        sourceAmountMinor: null,
        row: { ...line().row, role: "processor_fee", amountUsd: null, evidence: "unknown" },
      }),
    );

    expect(insert.sourceAmountMinor).toBeNull();
    expect(insert.amountUsd).toBeNull();
    expect(insert.evidence).toBe("unknown");
  });

  it("rejects invalid source minor-unit magnitudes", () => {
    expect(() => toEconomicLedgerInsert(line({ sourceAmountMinor: -1 }))).toThrow(RangeError);
    expect(() => toEconomicLedgerInsert(line({ sourceAmountMinor: 10.5 }))).toThrow(RangeError);
  });
});
