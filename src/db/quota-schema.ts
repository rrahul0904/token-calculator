import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, projects } from "@/db/schema";
import type { ProviderQuotaWindow } from "@/lib/quota/types";

/**
 * Metadata-only provider quota receipts uploaded by the local CLI.
 * Provider credentials, cookies, bearer tokens, refresh tokens, and raw
 * provider responses are deliberately not represented by this schema.
 */
export const providerQuotaSnapshots = pgTable(
  "provider_quota_snapshots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    authState: text("auth_state").notNull(),
    source: text("source").notNull().default("provider_reported"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    accountRef: text("account_ref"),
    plan: text("plan"),
    windows: jsonb("windows").$type<ProviderQuotaWindow[]>().notNull().default([]),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("provider_quota_snapshots_org_fetched_idx").on(table.organizationId, table.fetchedAt),
    index("provider_quota_snapshots_org_provider_fetched_idx").on(table.organizationId, table.provider, table.fetchedAt),
    index("provider_quota_snapshots_project_fetched_idx").on(table.projectId, table.fetchedAt),
  ],
);
