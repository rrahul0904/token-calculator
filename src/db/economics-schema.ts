import { index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "@/db/schema";

export const economicLedgerRows = pgTable(
  "economic_ledger_rows",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceProvider: text("source_provider").notNull(),
    sourceExternalId: text("source_external_id").notNull(),
    sourceCurrency: text("source_currency"),
    sourceAmountMinor: numeric("source_amount_minor", { precision: 30, scale: 0 }),
    economicRole: text("economic_role").notNull(),
    amountUsd: numeric("amount_usd", { precision: 20, scale: 8 }),
    productReference: text("product_reference"),
    customerReference: text("customer_reference"),
    planReference: text("plan_reference"),
    taskReference: text("task_reference"),
    provider: text("provider"),
    costPurpose: text("cost_purpose"),
    evidence: text("evidence").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("economic_ledger_rows_org_source_uq").on(
      table.organizationId,
      table.sourceProvider,
      table.sourceExternalId,
    ),
    index("economic_ledger_rows_org_occurred_idx").on(table.organizationId, table.occurredAt),
    index("economic_ledger_rows_product_idx").on(table.organizationId, table.productReference),
    index("economic_ledger_rows_customer_idx").on(table.organizationId, table.customerReference),
    index("economic_ledger_rows_role_idx").on(table.organizationId, table.economicRole),
  ],
);
