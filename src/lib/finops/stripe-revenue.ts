import type { EconomicLedgerRow } from "@/lib/finops/unit-economics";

export interface StripeChargeSnapshot {
  id: string;
  amountCapturedMinor: number;
  currency: string;
  createdUnixSeconds: number;
  customerId?: string | null;
  balanceTransaction?: {
    id: string;
    feeMinor: number;
    currency: string;
  } | null;
  refunds?: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    createdUnixSeconds: number;
    status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled" | string | null;
  }>;
}

export interface StripeRevenueAttribution {
  organizationId: string;
  productId?: string | null;
  planId?: string | null;
  taskId?: string | null;
}

export interface NormalizedStripeEconomicLine {
  sourceProvider: "stripe";
  /** Stable provider identity used by persistence to make replay idempotent. */
  sourceId: string;
  row: EconomicLedgerRow;
}

export interface StripeRevenueNormalizationResult {
  lines: NormalizedStripeEconomicLine[];
  skipped: Array<{ sourceId: string; reason: string }>;
}

function assertMinorAmount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer in minor currency units`);
  }
}

function assertUnixSeconds(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Stripe created timestamp must be a non-negative safe integer");
  }
}

function usdFromMinor(value: number) {
  return value / 100;
}

function assertUsd(currency: string, sourceId: string) {
  if (currency.toLowerCase() !== "usd") {
    throw new Error(`STRIPE_CURRENCY_NOT_NORMALIZED:${sourceId}:${currency.toLowerCase()}`);
  }
}

function baseRow(
  attribution: StripeRevenueAttribution,
  occurredAt: Date,
  customerId: string | null,
): Pick<
  EconomicLedgerRow,
  "occurredAt" | "organizationId" | "productId" | "customerId" | "planId" | "taskId" | "provider" | "evidence"
> {
  return {
    occurredAt,
    organizationId: attribution.organizationId,
    productId: attribution.productId ?? null,
    customerId,
    planId: attribution.planId ?? null,
    taskId: attribution.taskId ?? null,
    provider: "stripe",
    evidence: "provider_measured",
  };
}

/**
 * Normalize a captured Stripe charge plus its explicit refund objects into the
 * finance ledger. This adapter is intentionally USD-only until the FX ledger
 * exists. Non-USD inputs fail closed instead of pretending that minor units are
 * dollars or silently applying a stale exchange rate.
 *
 * Persistence should enforce uniqueness on (sourceProvider, sourceId). The
 * stable source IDs emitted here make replay deterministic without mutating any
 * database or calling Stripe.
 */
export function normalizeStripeChargeRevenue(
  charge: StripeChargeSnapshot,
  attribution: StripeRevenueAttribution,
): StripeRevenueNormalizationResult {
  assertMinorAmount(charge.amountCapturedMinor, "Stripe captured amount");
  assertUnixSeconds(charge.createdUnixSeconds);
  assertUsd(charge.currency, charge.id);

  const customerId = charge.customerId ?? null;
  const chargeOccurredAt = new Date(charge.createdUnixSeconds * 1000);
  const lines: NormalizedStripeEconomicLine[] = [
    {
      sourceProvider: "stripe",
      sourceId: `charge:${charge.id}:gross`,
      row: {
        ...baseRow(attribution, chargeOccurredAt, customerId),
        role: "gross_revenue",
        amountUsd: usdFromMinor(charge.amountCapturedMinor),
        costPurpose: null,
      },
    },
  ];

  if (charge.balanceTransaction) {
    assertMinorAmount(charge.balanceTransaction.feeMinor, "Stripe processor fee");
    assertUsd(charge.balanceTransaction.currency, charge.balanceTransaction.id);
    lines.push({
      sourceProvider: "stripe",
      sourceId: `balance_transaction:${charge.balanceTransaction.id}:fee`,
      row: {
        ...baseRow(attribution, chargeOccurredAt, customerId),
        role: "processor_fee",
        amountUsd: usdFromMinor(charge.balanceTransaction.feeMinor),
        costPurpose: null,
      },
    });
  } else {
    // A missing balance transaction means the processor fee is unknown, not 0.
    lines.push({
      sourceProvider: "stripe",
      sourceId: `charge:${charge.id}:fee:unknown`,
      row: {
        ...baseRow(attribution, chargeOccurredAt, customerId),
        role: "processor_fee",
        amountUsd: null,
        costPurpose: null,
        evidence: "unknown",
      },
    });
  }

  const skipped: StripeRevenueNormalizationResult["skipped"] = [];
  for (const refund of charge.refunds ?? []) {
    assertMinorAmount(refund.amountMinor, "Stripe refund amount");
    assertUnixSeconds(refund.createdUnixSeconds);
    assertUsd(refund.currency, refund.id);

    if (refund.status !== "succeeded") {
      skipped.push({ sourceId: `refund:${refund.id}`, reason: `refund_status:${refund.status ?? "unknown"}` });
      continue;
    }

    lines.push({
      sourceProvider: "stripe",
      sourceId: `refund:${refund.id}`,
      row: {
        ...baseRow(attribution, new Date(refund.createdUnixSeconds * 1000), customerId),
        role: "refund",
        amountUsd: usdFromMinor(refund.amountMinor),
        costPurpose: null,
      },
    });
  }

  return { lines, skipped };
}
