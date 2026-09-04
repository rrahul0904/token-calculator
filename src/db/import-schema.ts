import { index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "@/db/schema";
import { providerUsageImports } from "@/db/gap-closure-schema";

export const providerUsageImportRows = pgTable("provider_usage_import_rows", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  importId: text("import_id").notNull().references(() => providerUsageImports.id, { onDelete: "cascade" }),
  sourceRow: integer("source_row").notNull(),
  provider: text("provider").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  costUsd: numeric("cost_usd", { precision: 20, scale: 8 }),
  model: text("model"),
  userReference: text("user_reference"),
  apiKeyReference: text("api_key_reference"),
  projectReference: text("project_reference"),
  runReference: text("run_reference"),
  tokens: integer("tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("provider_usage_import_rows_import_idx").on(table.importId),
  index("provider_usage_import_rows_org_period_idx").on(table.organizationId, table.periodStart),
  index("provider_usage_import_rows_run_idx").on(table.runReference),
]);
