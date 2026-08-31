import { boolean, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { apiKeys, organizations } from "@/db/schema";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const apiKeyQuotas = pgTable(
  "api_key_quotas",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
    requestsPerMinute: integer("requests_per_minute").notNull().default(120),
    monthlyTokenLimit: integer("monthly_token_limit"),
    monthlyCostLimitUsd: numeric("monthly_cost_limit_usd", { precision: 20, scale: 8 }),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("api_key_quotas_key_uq").on(table.apiKeyId),
    index("api_key_quotas_org_idx").on(table.organizationId),
  ],
);

export const alertEndpoints = pgTable(
  "alert_endpoints",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("webhook"),
    encryptedUrl: text("encrypted_url").notNull(),
    eventTypes: text("event_types").array().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("alert_endpoints_org_idx").on(table.organizationId)],
);

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    endpointId: text("endpoint_id").references(() => alertEndpoints.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    status: text("status").notNull(),
    statusCode: integer("status_code"),
    attemptCount: integer("attempt_count").notNull().default(1),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("alert_deliveries_org_idx").on(table.organizationId), index("alert_deliveries_endpoint_idx").on(table.endpointId)],
);
