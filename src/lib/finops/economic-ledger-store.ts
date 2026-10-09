import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { economicLedgerRows } from "@/db/economics-schema";
import type { EconomicLedgerRow } from "@/lib/finops/unit-economics";

export interface PersistableEconomicLine {
  sourceProvider: string;
  sourceId: string;
  sourceCurrency?: string | null;
  sourceAmountMinor?: number | null;
  row: EconomicLedgerRow;
  metadata?: Record<string, unknown>;
}

function assertSourceAmount(value: number | null | undefined) {
  if (value === undefined || value === null) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("sourceAmountMinor must be a non-negative safe integer or null");
  }
}

export function economicLedgerRowId(line: Pick<PersistableEconomicLine, "sourceProvider" | "sourceId" | "row">) {
  const identity = `${line.row.organizationId}\u0000${line.sourceProvider}\u0000${line.sourceId}`;
  const digest = createHash("sha256").update(identity).digest("hex");
  return `econ_${digest.slice(0, 40)}`;
}

export function toEconomicLedgerInsert(line: PersistableEconomicLine) {
  assertSourceAmount(line.sourceAmountMinor);

  return {
    id: economicLedgerRowId(line),
    organizationId: line.row.organizationId,
    sourceProvider: line.sourceProvider,
    sourceExternalId: line.sourceId,
    sourceCurrency: line.sourceCurrency?.toLowerCase() ?? null,
    sourceAmountMinor:
      line.sourceAmountMinor === undefined || line.sourceAmountMinor === null ? null : String(line.sourceAmountMinor),
    economicRole: line.row.role,
    amountUsd: line.row.amountUsd === null ? null : String(line.row.amountUsd),
    productReference: line.row.productId ?? null,
    customerReference: line.row.customerId ?? null,
    planReference: line.row.planId ?? null,
    taskReference: line.row.taskId ?? null,
    provider: line.row.provider ?? null,
    costPurpose: line.row.costPurpose ?? null,
    evidence: line.row.evidence,
    occurredAt: line.row.occurredAt,
    metadata: line.metadata ?? {},
  };
}

/**
 * Upsert provider-normalized economics using the provider source identity as the
 * replay key. Re-ingesting the same provider object updates its normalized view
 * instead of manufacturing a duplicate revenue/cost line.
 */
export async function persistEconomicLines(lines: PersistableEconomicLine[]) {
  if (lines.length === 0) return { written: 0 };

  const db = getDb();
  await db.transaction(async (tx) => {
    for (const line of lines) {
      const insert = toEconomicLedgerInsert(line);
      await tx
        .insert(economicLedgerRows)
        .values(insert)
        .onConflictDoUpdate({
          target: [
            economicLedgerRows.organizationId,
            economicLedgerRows.sourceProvider,
            economicLedgerRows.sourceExternalId,
          ],
          set: {
            sourceCurrency: insert.sourceCurrency,
            sourceAmountMinor: insert.sourceAmountMinor,
            economicRole: insert.economicRole,
            amountUsd: insert.amountUsd,
            productReference: insert.productReference,
            customerReference: insert.customerReference,
            planReference: insert.planReference,
            taskReference: insert.taskReference,
            provider: insert.provider,
            costPurpose: insert.costPurpose,
            evidence: insert.evidence,
            occurredAt: insert.occurredAt,
            metadata: insert.metadata,
            updatedAt: new Date(),
          },
        });
    }
  });

  return { written: lines.length };
}
