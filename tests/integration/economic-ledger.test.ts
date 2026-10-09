import process from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import {
  persistEconomicLines,
  type PersistableEconomicLine,
} from "@/lib/finops/economic-ledger-store";

const integrationEnabled = process.env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

function expectPgCode(error: unknown, code: string) {
  expect(error).toBeTruthy();
  expect(typeof error).toBe("object");
  expect((error as { code?: string }).code).toBe(code);
}

describeIntegration("economic ledger database invariants", () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const organizationId = `econ_org_${suffix}`;

  const line = (overrides: Partial<PersistableEconomicLine> = {}): PersistableEconomicLine => ({
    sourceProvider: "stripe",
    sourceId: `charge:ch_${suffix}:gross`,
    sourceCurrency: "usd",
    sourceAmountMinor: 10_000,
    row: {
      occurredAt: new Date("2026-10-09T12:00:00Z"),
      role: "gross_revenue",
      amountUsd: 100,
      organizationId,
      productId: "product_1",
      customerId: "cus_1",
      planId: "pro",
      taskId: "task_1",
      provider: "stripe",
      costPurpose: null,
      evidence: "provider_measured",
    },
    metadata: { source: "integration-test" },
    ...overrides,
  });

  beforeAll(async () => {
    expect(databaseUrl).toBeTruthy();
    await sql`insert into organizations (id, name, slug)
      values (${organizationId}, 'Economic Ledger Integration', ${`economic-ledger-${suffix}`})`;
  });

  afterAll(async () => {
    await closeDb();
    await sql`delete from organizations where id = ${organizationId}`;
    await sql.end({ timeout: 3 });
  });

  it("upserts a provider replay instead of duplicating revenue", async () => {
    const sourceId = `charge:replay_${suffix}:gross`;
    await persistEconomicLines([line({ sourceId })]);
    await persistEconomicLines([
      line({
        sourceId,
        sourceAmountMinor: 10_500,
        row: { ...line().row, amountUsd: 105, evidence: "reconciled" },
        metadata: { source: "reconciled-replay" },
      }),
    ]);

    const rows = await sql<
      Array<{ amount_usd: string | null; source_amount_minor: string | null; evidence: string; metadata: unknown }>
    >`select amount_usd, source_amount_minor, evidence, metadata
      from economic_ledger_rows
      where organization_id = ${organizationId}
        and source_provider = 'stripe'
        and source_external_id = ${sourceId}`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount_usd).toBe("105.00000000");
    expect(rows[0]?.source_amount_minor).toBe("10500");
    expect(rows[0]?.evidence).toBe("reconciled");
    expect(rows[0]?.metadata).toEqual({ source: "reconciled-replay" });
  });

  it("preserves an unknown processor fee as null rather than zero", async () => {
    const sourceId = `charge:unknown_fee_${suffix}`;
    await persistEconomicLines([
      line({
        sourceId,
        sourceAmountMinor: null,
        row: {
          ...line().row,
          role: "processor_fee",
          amountUsd: null,
          evidence: "unknown",
        },
      }),
    ]);

    const rows = await sql<Array<{ amount_usd: string | null; source_amount_minor: string | null; evidence: string }>>`
      select amount_usd, source_amount_minor, evidence
      from economic_ledger_rows
      where organization_id = ${organizationId}
        and source_external_id = ${sourceId}`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount_usd).toBeNull();
    expect(rows[0]?.source_amount_minor).toBeNull();
    expect(rows[0]?.evidence).toBe("unknown");
  });

  it("rejects negative normalized money at the database boundary", async () => {
    try {
      await sql`insert into economic_ledger_rows
        (id, organization_id, source_provider, source_external_id, economic_role, amount_usd, evidence, occurred_at)
        values (
          ${`econ_invalid_${suffix}`}, ${organizationId}, 'manual', ${`negative_${suffix}`},
          'variable_cost', -1, 'user_entered', now()
        )`;
      throw new Error("expected economic ledger non-negative constraint rejection");
    } catch (error) {
      expectPgCode(error, "23514");
    }
  });

  it("enforces one durable row per tenant/provider/source identity", async () => {
    const sourceId = `duplicate_${suffix}`;
    await sql`insert into economic_ledger_rows
      (id, organization_id, source_provider, source_external_id, economic_role, amount_usd, evidence, occurred_at)
      values (${`econ_duplicate_a_${suffix}`}, ${organizationId}, 'manual', ${sourceId}, 'fixed_cost', 10, 'user_entered', now())`;

    try {
      await sql`insert into economic_ledger_rows
        (id, organization_id, source_provider, source_external_id, economic_role, amount_usd, evidence, occurred_at)
        values (${`econ_duplicate_b_${suffix}`}, ${organizationId}, 'manual', ${sourceId}, 'fixed_cost', 10, 'user_entered', now())`;
      throw new Error("expected economic ledger uniqueness rejection");
    } catch (error) {
      expectPgCode(error, "23505");
    }
  });
});
