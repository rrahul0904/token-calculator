import { describe, expect, it } from "vitest";
import { normalizeStripeChargeRevenue, type StripeChargeSnapshot } from "@/lib/finops/stripe-revenue";
import { summarizeUnitEconomics } from "@/lib/finops/unit-economics";

const charge = (overrides: Partial<StripeChargeSnapshot> = {}): StripeChargeSnapshot => ({
  id: "ch_1",
  amountCapturedMinor: 10_000,
  currency: "usd",
  createdUnixSeconds: 1_780_272_000,
  customerId: "cus_1",
  balanceTransaction: {
    id: "txn_1",
    feeMinor: 320,
    currency: "usd",
  },
  refunds: [],
  ...overrides,
});

const attribution = {
  organizationId: "org_1",
  productId: "product_1",
  planId: "pro",
  taskId: "task_1",
};

describe("Stripe revenue normalization", () => {
  it("maps captured revenue and processor fee into stable replay-safe source identities", () => {
    const result = normalizeStripeChargeRevenue(charge(), attribution);

    expect(result.skipped).toEqual([]);
    expect(result.lines.map((line) => line.sourceId)).toEqual([
      "charge:ch_1:gross",
      "balance_transaction:txn_1:fee",
    ]);
    expect(result.lines[0]).toMatchObject({ sourceCurrency: "usd", sourceAmountMinor: 10_000 });
    expect(result.lines[0]?.row).toMatchObject({
      role: "gross_revenue",
      amountUsd: 100,
      customerId: "cus_1",
      productId: "product_1",
      planId: "pro",
      taskId: "task_1",
      provider: "stripe",
      evidence: "provider_measured",
    });
    expect(result.lines[1]).toMatchObject({ sourceCurrency: "usd", sourceAmountMinor: 320 });
    expect(result.lines[1]?.row).toMatchObject({ role: "processor_fee", amountUsd: 3.2 });

    const summary = summarizeUnitEconomics(result.lines.map((line) => line.row));
    expect(summary.netRevenueUsd).toBe(96.8);
  });

  it("emits an explicit unknown fee when the Stripe balance transaction is unavailable", () => {
    const result = normalizeStripeChargeRevenue(charge({ balanceTransaction: null }), attribution);
    const fee = result.lines.find((line) => line.row.role === "processor_fee");

    expect(fee?.sourceId).toBe("charge:ch_1:fee:unknown");
    expect(fee?.sourceCurrency).toBe("usd");
    expect(fee?.sourceAmountMinor).toBeNull();
    expect(fee?.row.amountUsd).toBeNull();
    expect(fee?.row.evidence).toBe("unknown");

    const summary = summarizeUnitEconomics(result.lines.map((line) => line.row));
    expect(summary.netRevenueUsd).toBeNull();
    expect(summary.unknownRevenueRows).toBe(1);
  });

  it("subtracts only succeeded refunds and records pending refunds as skipped", () => {
    const result = normalizeStripeChargeRevenue(
      charge({
        refunds: [
          {
            id: "re_success",
            amountMinor: 1_500,
            currency: "usd",
            createdUnixSeconds: 1_780_358_400,
            status: "succeeded",
          },
          {
            id: "re_pending",
            amountMinor: 500,
            currency: "usd",
            createdUnixSeconds: 1_780_358_500,
            status: "pending",
          },
        ],
      }),
      attribution,
    );

    const succeededRefund = result.lines.find((line) => line.sourceId === "refund:re_success");
    expect(succeededRefund).toMatchObject({ sourceCurrency: "usd", sourceAmountMinor: 1_500 });
    expect(result.lines.map((line) => line.sourceId)).not.toContain("refund:re_pending");
    expect(result.skipped).toEqual([{ sourceId: "refund:re_pending", reason: "refund_status:pending" }]);

    const summary = summarizeUnitEconomics(result.lines.map((line) => line.row));
    expect(summary.netRevenueUsd).toBe(81.8);
  });

  it("fails closed for non-USD data until the dated FX ledger exists", () => {
    expect(() => normalizeStripeChargeRevenue(charge({ currency: "eur" }), attribution)).toThrow(
      "STRIPE_CURRENCY_NOT_NORMALIZED:ch_1:eur",
    );
    expect(() =>
      normalizeStripeChargeRevenue(
        charge({ balanceTransaction: { id: "txn_eur", feeMinor: 300, currency: "eur" } }),
        attribution,
      ),
    ).toThrow("STRIPE_CURRENCY_NOT_NORMALIZED:txn_eur:eur");
  });

  it("rejects negative or fractional provider minor-unit inputs", () => {
    expect(() => normalizeStripeChargeRevenue(charge({ amountCapturedMinor: -1 }), attribution)).toThrow(RangeError);
    expect(() => normalizeStripeChargeRevenue(charge({ amountCapturedMinor: 100.5 }), attribution)).toThrow(RangeError);
  });
});
