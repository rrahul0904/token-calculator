import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { savedScenarios, users } from "@/db/schema";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const inferenceEndpoints = pgTable(
  "inference_endpoints",
  {
    id: text("id").primaryKey(),
    canonicalModelId: text("canonical_model_id").notNull(),
    inferenceProvider: text("inference_provider").notNull(),
    externalModelId: text("external_model_id").notNull(),
    source: text("source").notNull(),
    contextWindow: integer("context_window"),
    maxOutputTokens: integer("max_output_tokens"),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inference_endpoints_source_external_uq").on(table.source, table.externalModelId),
    index("inference_endpoints_model_idx").on(table.canonicalModelId),
  ],
);

export const pricingSnapshots = pgTable(
  "pricing_snapshots",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    status: text("status").notNull().default("candidate"),
    payloadHash: text("payload_hash"),
    modelCount: integer("model_count").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index("pricing_snapshots_source_published_idx").on(table.source, table.publishedAt)],
);

export const pricingRates = pgTable(
  "pricing_rates",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id").notNull().references(() => pricingSnapshots.id, { onDelete: "cascade" }),
    endpointId: text("endpoint_id").notNull().references(() => inferenceEndpoints.id, { onDelete: "cascade" }),
    inputPerMillion: numeric("input_per_million", { precision: 24, scale: 8 }),
    cachedInputPerMillion: numeric("cached_input_per_million", { precision: 24, scale: 8 }),
    cacheWritePerMillion: numeric("cache_write_per_million", { precision: 24, scale: 8 }),
    outputPerMillion: numeric("output_per_million", { precision: 24, scale: 8 }),
    currency: text("currency").notNull().default("USD"),
    sourceUrl: text("source_url").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("pricing_rates_snapshot_endpoint_uq").on(table.snapshotId, table.endpointId),
    index("pricing_rates_endpoint_idx").on(table.endpointId),
  ],
);

export const pricingOverrides = pgTable(
  "pricing_overrides",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id").notNull().references(() => inferenceEndpoints.id, { onDelete: "cascade" }),
    values: jsonb("values").$type<Record<string, number | null>>().notNull(),
    reason: text("reason").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("pricing_overrides_endpoint_idx").on(table.endpointId, table.expiresAt)],
);

export const scenarioVersions = pgTable(
  "scenario_versions",
  {
    id: text("id").primaryKey(),
    scenarioId: text("scenario_id").notNull().references(() => savedScenarios.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    pricingSnapshotId: text("pricing_snapshot_id").references(() => pricingSnapshots.id, { onDelete: "set null" }),
    assumptions: jsonb("assumptions").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("scenario_versions_scenario_version_uq").on(table.scenarioId, table.version),
    index("scenario_versions_pricing_snapshot_idx").on(table.pricingSnapshotId),
  ],
);
