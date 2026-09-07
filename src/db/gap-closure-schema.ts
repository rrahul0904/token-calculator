import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, projects, runs, users } from "@/db/schema";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  costCenter: text("cost_center"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("teams_org_slug_uq").on(table.organizationId, table.slug),
  index("teams_org_idx").on(table.organizationId),
]);

export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  ...timestamps,
}, (table) => [
  uniqueIndex("team_members_team_user_uq").on(table.teamId, table.userId),
  index("team_members_org_idx").on(table.organizationId),
]);

export const projectTeams = pgTable("project_teams", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("project_teams_project_team_uq").on(table.projectId, table.teamId),
  index("project_teams_org_idx").on(table.organizationId),
]);

export const costCenterAssignments = pgTable("cost_center_assignments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id").notNull(),
  costCenter: text("cost_center").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("cost_center_assignments_scope_uq").on(table.organizationId, table.scopeType, table.scopeId),
  index("cost_center_assignments_org_idx").on(table.organizationId),
]);

export const pricingSnapshots = pgTable("pricing_snapshots", {
  id: text("id").primaryKey(),
  pricingVersion: text("pricing_version").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  sourceUrl: text("source_url").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  inputPerMillionUsd: numeric("input_per_million_usd", { precision: 20, scale: 8 }).notNull(),
  cacheReadPerMillionUsd: numeric("cache_read_per_million_usd", { precision: 20, scale: 8 }),
  cacheWritePerMillionUsd: numeric("cache_write_per_million_usd", { precision: 20, scale: 8 }),
  outputPerMillionUsd: numeric("output_per_million_usd", { precision: 20, scale: 8 }).notNull(),
  dimensions: jsonb("dimensions").$type<Record<string, unknown>>().notNull().default({}),
  longContextTiers: jsonb("long_context_tiers").$type<Array<Record<string, unknown>>>().notNull().default([]),
  catalogHash: text("catalog_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("pricing_snapshots_version_provider_model_uq").on(table.pricingVersion, table.provider, table.model),
  index("pricing_snapshots_model_effective_idx").on(table.provider, table.model, table.effectiveFrom),
]);

export const providerUsageImports = pgTable("provider_usage_imports", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  sourceIdentity: text("source_identity").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  sourceHash: text("source_hash").notNull(),
  status: text("status").notNull().default("previewed"),
  totalCostUsd: numeric("total_cost_usd", { precision: 20, scale: 8 }),
  rowCount: integer("row_count").notNull().default(0),
  provenance: text("provenance").notNull().default("provider_imported"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (table) => [
  uniqueIndex("provider_usage_imports_org_source_hash_uq").on(table.organizationId, table.sourceHash),
  index("provider_usage_imports_org_period_idx").on(table.organizationId, table.periodStart),
]);

export const anomalies = pgTable("anomalies", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id"),
  metric: text("metric").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  baseline: numeric("baseline", { precision: 24, scale: 8 }).notNull(),
  observed: numeric("observed", { precision: 24, scale: 8 }).notNull(),
  delta: numeric("delta", { precision: 24, scale: 8 }).notNull(),
  threshold: numeric("threshold", { precision: 24, scale: 8 }).notNull(),
  confidence: text("confidence").notNull(),
  method: text("method").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("anomalies_org_period_idx").on(table.organizationId, table.periodStart)]);

export const promptConfigVersions = pgTable("prompt_config_versions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  identity: text("identity").notNull(),
  version: text("version").notNull(),
  contentHash: text("content_hash").notNull(),
  label: text("label"),
  deploymentEnvironment: text("deployment_environment"),
  modelRoute: text("model_route"),
  contextBundleVersion: text("context_bundle_version"),
  skillVersion: text("skill_version"),
  agentConfigVersion: text("agent_config_version"),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  contentStored: boolean("content_stored").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (table) => [
  uniqueIndex("prompt_config_versions_identity_version_uq").on(table.organizationId, table.kind, table.identity, table.version),
  index("prompt_config_versions_org_idx").on(table.organizationId),
]);

export const runConfigAttributions = pgTable("run_config_attributions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  promptConfigVersionId: text("prompt_config_version_id").notNull().references(() => promptConfigVersions.id, { onDelete: "cascade" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("run_config_attributions_run_version_uq").on(table.runId, table.promptConfigVersionId),
  index("run_config_attributions_org_idx").on(table.organizationId),
]);

export const evaluationDatasets = pgTable("evaluation_datasets", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: text("version").notNull(),
  contentRetentionMode: text("content_retention_mode").notNull().default("metadata_only"),
  ...timestamps,
}, (table) => [uniqueIndex("evaluation_datasets_org_name_version_uq").on(table.organizationId, table.name, table.version)]);

export const evaluationCases = pgTable("evaluation_cases", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  datasetId: text("dataset_id").notNull().references(() => evaluationDatasets.id, { onDelete: "cascade" }),
  inputReference: text("input_reference").notNull(),
  expectedOutcome: jsonb("expected_outcome").$type<Record<string, unknown>>().notNull().default({}),
  tags: text("tags").array().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (table) => [index("evaluation_cases_dataset_idx").on(table.datasetId)]);

export const experiments = pgTable("experiments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  datasetId: text("dataset_id").notNull().references(() => evaluationDatasets.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  baselineConfig: jsonb("baseline_config").$type<Record<string, unknown>>().notNull(),
  candidateConfig: jsonb("candidate_config").$type<Record<string, unknown>>().notNull(),
  qualityThreshold: numeric("quality_threshold", { precision: 10, scale: 4 }),
  maxCostRegressionPct: numeric("max_cost_regression_pct", { precision: 10, scale: 4 }),
  ...timestamps,
}, (table) => [index("experiments_org_idx").on(table.organizationId)]);

export const experimentResults = pgTable("experiment_results", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  experimentId: text("experiment_id").notNull().references(() => experiments.id, { onDelete: "cascade" }),
  variant: text("variant").notNull(),
  caseId: text("case_id").references(() => evaluationCases.id, { onDelete: "set null" }),
  runId: text("run_id").references(() => runs.id, { onDelete: "set null" }),
  qualityScore: numeric("quality_score", { precision: 10, scale: 4 }),
  costUsd: numeric("cost_usd", { precision: 20, scale: 8 }),
  tokens: integer("tokens"),
  latencyMs: integer("latency_ms"),
  retries: integer("retries").notNull().default(0),
  fallbacks: integer("fallbacks").notNull().default(0),
  success: boolean("success"),
  evaluatorResults: jsonb("evaluator_results").$type<Array<Record<string, unknown>>>().notNull().default([]),
  ...timestamps,
}, (table) => [index("experiment_results_experiment_idx").on(table.experimentId)]);
