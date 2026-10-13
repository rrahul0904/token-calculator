export type EconomicRole =
  | "gross_revenue"
  | "processor_fee"
  | "refund"
  | "variable_cost"
  | "fixed_cost";

export type CostPurpose =
  | "paid_service"
  | "free_trial"
  | "acquisition"
  | "rd_testing"
  | "shared"
  | "fixed_overhead"
  | "unknown";

export type EconomicEvidence =
  | "provider_measured"
  | "platform_recorded"
  | "user_entered"
  | "estimated"
  | "reconciled"
  | "unknown";

export type UnitEconomicsDimension = "product" | "customer" | "plan" | "task" | "provider";

export interface EconomicLedgerRow {
  occurredAt: Date;
  role: EconomicRole;
  /**
   * Non-negative magnitude in USD. The role determines whether the amount
   * contributes to revenue, reduces net revenue, or contributes to cost.
   * null means the monetary value is genuinely unknown and must stay unknown.
   */
  amountUsd: number | null;
  organizationId: string;
  productId?: string | null;
  customerId?: string | null;
  planId?: string | null;
  taskId?: string | null;
  provider?: string | null;
  costPurpose?: CostPurpose | null;
  evidence: EconomicEvidence;
}

interface PurposeTotals {
  knownCostUsd: number;
  unknownRows: number;
}

export interface UnitEconomicsSummary {
  rowCount: number;
  knownGrossRevenueUsd: number;
  knownProcessorFeesUsd: number;
  knownRefundsUsd: number;
  knownNetRevenueUsd: number;
  netRevenueUsd: number | null;
  knownVariableCostUsd: number;
  knownFixedCostUsd: number;
  knownOperatingCostUsd: number;
  knownPaidServiceVariableCostUsd: number;
  knownContributionProfitUsd: number;
  contributionProfitUsd: number | null;
  knownOperatingProfitUsd: number;
  operatingProfitUsd: number | null;
  contributionMarginPct: number | null;
  operatingMarginPct: number | null;
  unknownRevenueRows: number;
  unknownCostRows: number;
  unknownPaidServiceCostRows: number;
  ambiguousContributionRows: number;
  netRevenueComplete: boolean;
  contributionComplete: boolean;
  operatingProfitComplete: boolean;
  costByPurpose: Record<CostPurpose, PurposeTotals>;
  evidenceCounts: Record<EconomicEvidence, number>;
  incompleteReasons: string[];
}

const COST_PURPOSES: CostPurpose[] = [
  "paid_service",
  "free_trial",
  "acquisition",
  "rd_testing",
  "shared",
  "fixed_overhead",
  "unknown",
];

const EVIDENCE_KINDS: EconomicEvidence[] = [
  "provider_measured",
  "platform_recorded",
  "user_entered",
  "estimated",
  "reconciled",
  "unknown",
];

function purposeTotals(): Record<CostPurpose, PurposeTotals> {
  return Object.fromEntries(
    COST_PURPOSES.map((purpose) => [purpose, { knownCostUsd: 0, unknownRows: 0 }]),
  ) as Record<CostPurpose, PurposeTotals>;
}

function evidenceCounts(): Record<EconomicEvidence, number> {
  return Object.fromEntries(EVIDENCE_KINDS.map((evidence) => [evidence, 0])) as Record<
    EconomicEvidence,
    number
  >;
}

function validateAmount(row: EconomicLedgerRow) {
  if (row.amountUsd === null) return;
  if (!Number.isFinite(row.amountUsd) || row.amountUsd < 0) {
    throw new RangeError(`Economic ledger amounts must be finite and non-negative: ${row.amountUsd}`);
  }
}

function isCostRole(role: EconomicRole) {
  return role === "variable_cost" || role === "fixed_cost";
}

export function summarizeUnitEconomics(rows: EconomicLedgerRow[]): UnitEconomicsSummary {
  let knownGrossRevenueUsd = 0;
  let knownProcessorFeesUsd = 0;
  let knownRefundsUsd = 0;
  let knownVariableCostUsd = 0;
  let knownFixedCostUsd = 0;
  let knownPaidServiceVariableCostUsd = 0;
  let unknownRevenueRows = 0;
  let unknownCostRows = 0;
  let unknownPaidServiceCostRows = 0;
  let ambiguousContributionRows = 0;
  const costByPurpose = purposeTotals();
  const countsByEvidence = evidenceCounts();

  for (const row of rows) {
    validateAmount(row);
    countsByEvidence[row.evidence] += 1;

    if (row.role === "gross_revenue") {
      if (row.amountUsd === null) unknownRevenueRows += 1;
      else knownGrossRevenueUsd += row.amountUsd;
      continue;
    }

    if (row.role === "processor_fee") {
      if (row.amountUsd === null) unknownRevenueRows += 1;
      else knownProcessorFeesUsd += row.amountUsd;
      continue;
    }

    if (row.role === "refund") {
      if (row.amountUsd === null) unknownRevenueRows += 1;
      else knownRefundsUsd += row.amountUsd;
      continue;
    }

    if (!isCostRole(row.role)) continue;

    const purpose = row.costPurpose ?? "unknown";
    if (row.amountUsd === null) {
      unknownCostRows += 1;
      costByPurpose[purpose].unknownRows += 1;
    } else {
      costByPurpose[purpose].knownCostUsd += row.amountUsd;
      if (row.role === "variable_cost") knownVariableCostUsd += row.amountUsd;
      else knownFixedCostUsd += row.amountUsd;
    }

    if (row.role !== "variable_cost") continue;

    if (purpose === "paid_service") {
      if (row.amountUsd === null) unknownPaidServiceCostRows += 1;
      else knownPaidServiceVariableCostUsd += row.amountUsd;
    } else if (purpose === "shared" || purpose === "unknown") {
      // A shared or unclassified variable cost may belong to paid serving, but
      // there is not enough evidence to include or exclude it from contribution margin.
      ambiguousContributionRows += 1;
    }
  }

  const knownNetRevenueUsd = knownGrossRevenueUsd - knownProcessorFeesUsd - knownRefundsUsd;
  const knownOperatingCostUsd = knownVariableCostUsd + knownFixedCostUsd;
  const knownContributionProfitUsd = knownNetRevenueUsd - knownPaidServiceVariableCostUsd;
  const knownOperatingProfitUsd = knownNetRevenueUsd - knownOperatingCostUsd;

  const netRevenueComplete = unknownRevenueRows === 0;
  const contributionComplete =
    netRevenueComplete && unknownPaidServiceCostRows === 0 && ambiguousContributionRows === 0;
  const operatingProfitComplete = netRevenueComplete && unknownCostRows === 0;

  const netRevenueUsd = netRevenueComplete ? knownNetRevenueUsd : null;
  const contributionProfitUsd = contributionComplete ? knownContributionProfitUsd : null;
  const operatingProfitUsd = operatingProfitComplete ? knownOperatingProfitUsd : null;

  const contributionMarginPct =
    contributionProfitUsd !== null && netRevenueUsd !== null && netRevenueUsd > 0
      ? (contributionProfitUsd / netRevenueUsd) * 100
      : null;
  const operatingMarginPct =
    operatingProfitUsd !== null && netRevenueUsd !== null && netRevenueUsd > 0
      ? (operatingProfitUsd / netRevenueUsd) * 100
      : null;

  const incompleteReasons: string[] = [];
  if (unknownRevenueRows > 0) incompleteReasons.push("unknown_net_revenue_components");
  if (unknownPaidServiceCostRows > 0) incompleteReasons.push("unknown_paid_service_costs");
  if (ambiguousContributionRows > 0) incompleteReasons.push("ambiguous_shared_or_unclassified_variable_costs");
  if (unknownCostRows > 0) incompleteReasons.push("unknown_operating_costs");

  return {
    rowCount: rows.length,
    knownGrossRevenueUsd,
    knownProcessorFeesUsd,
    knownRefundsUsd,
    knownNetRevenueUsd,
    netRevenueUsd,
    knownVariableCostUsd,
    knownFixedCostUsd,
    knownOperatingCostUsd,
    knownPaidServiceVariableCostUsd,
    knownContributionProfitUsd,
    contributionProfitUsd,
    knownOperatingProfitUsd,
    operatingProfitUsd,
    contributionMarginPct,
    operatingMarginPct,
    unknownRevenueRows,
    unknownCostRows,
    unknownPaidServiceCostRows,
    ambiguousContributionRows,
    netRevenueComplete,
    contributionComplete,
    operatingProfitComplete,
    costByPurpose,
    evidenceCounts: countsByEvidence,
    incompleteReasons,
  };
}

function dimensionValue(row: EconomicLedgerRow, dimension: UnitEconomicsDimension) {
  const value =
    dimension === "product"
      ? row.productId
      : dimension === "customer"
        ? row.customerId
        : dimension === "plan"
          ? row.planId
          : dimension === "task"
            ? row.taskId
            : row.provider;
  return value || "unassigned";
}

export function groupUnitEconomics(rows: EconomicLedgerRow[], dimension: UnitEconomicsDimension) {
  const groups = new Map<string, EconomicLedgerRow[]>();
  for (const row of rows) {
    const key = dimensionValue(row, dimension);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...summarizeUnitEconomics(group) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
