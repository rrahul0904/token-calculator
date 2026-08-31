import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const jsonObject = <T extends Record<string, unknown>>() => jsonb("metadata").$type<T>().notNull().default({});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    workosUserId: text("workos_user_id"),
    email: text("email").notNull(),
    name: text("name"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_workos_user_id_uq").on(table.workosUserId),
    uniqueIndex("users_email_uq").on(table.email),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    workosOrganizationId: text("workos_organization_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    plan: text("plan").notNull().default("free"),
    retentionDays: integer("retention_days").notNull().default(90),
    contentRetentionEnabled: boolean("content_retention_enabled").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organizations_workos_id_uq").on(table.workosOrganizationId),
    uniqueIndex("organizations_slug_uq").on(table.slug),
  ],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("developer"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organization_members_org_user_uq").on(table.organizationId, table.userId),
    index("organization_members_user_idx").on(table.userId),
  ],
);

export const serviceAccounts = pgTable(
  "service_accounts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("service_accounts_org_idx").on(table.organizationId)],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("projects_org_slug_uq").on(table.organizationId, table.slug),
    index("projects_org_idx").on(table.organizationId),
  ],
);

export const savedScenarios = pgTable(
  "saved_scenarios",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    scenario: jsonb("scenario").$type<Record<string, unknown>>().notNull(),
    promptHashA: text("prompt_hash_a"),
    promptHashB: text("prompt_hash_b"),
    ...timestamps,
  },
  (table) => [index("saved_scenarios_org_idx").on(table.organizationId), index("saved_scenarios_project_idx").on(table.projectId)],
);

export const promptComparisons = pgTable(
  "prompt_comparisons",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    scenarioId: text("scenario_id").references(() => savedScenarios.id, { onDelete: "set null" }),
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
    outcomeEquivalent: boolean("outcome_equivalent"),
    ...timestamps,
  },
  (table) => [index("prompt_comparisons_org_idx").on(table.organizationId)],
);

export const billingCustomers = pgTable(
  "billing_customers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("billing_customers_org_uq").on(table.organizationId),
    uniqueIndex("billing_customers_stripe_uq").on(table.stripeCustomerId),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    stripePriceId: text("stripe_price_id"),
    plan: text("plan").notNull(),
    status: text("status").notNull(),
    seats: integer("seats").notNull().default(1),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("subscriptions_stripe_uq").on(table.stripeSubscriptionId),
    index("subscriptions_org_idx").on(table.organizationId),
  ],
);

export const entitlementOverrides = pgTable(
  "entitlement_overrides",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("entitlement_overrides_org_key_uq").on(table.organizationId, table.key)],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    metric: text("metric").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    value: numeric("value", { precision: 24, scale: 6 }).notNull().default("0"),
    ...timestamps,
  },
  (table) => [uniqueIndex("usage_counters_scope_period_uq").on(table.organizationId, table.scopeType, table.scopeId, table.metric, table.periodStart)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    serviceAccountId: text("service_account_id").references(() => serviceAccounts.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    environment: text("environment").notNull().default("live"),
    prefix: text("prefix").notNull(),
    lastFour: text("last_four").notNull(),
    secretHash: text("secret_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("api_keys_prefix_uq").on(table.prefix),
    index("api_keys_org_idx").on(table.organizationId),
  ],
);

export const integrationInstallations = pgTable(
  "integration_installations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("not_configured"),
    externalId: text("external_id"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("integration_installations_org_provider_uq").on(table.organizationId, table.provider)],
);

export const providerConnections = pgTable(
  "provider_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    encryptedCredential: text("encrypted_credential").notNull(),
    credentialKeyVersion: integer("credential_key_version").notNull().default(1),
    status: text("status").notNull().default("active"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("provider_connections_org_idx").on(table.organizationId)],
);

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    developerUserId: text("developer_user_id").references(() => users.id, { onDelete: "set null" }),
    serviceAccountId: text("service_account_id").references(() => serviceAccounts.id, { onDelete: "set null" }),
    environment: text("environment").notNull().default("development"),
    agentName: text("agent_name").notNull(),
    agentVendor: text("agent_vendor"),
    agentVersion: text("agent_version"),
    workflowName: text("workflow_name"),
    workflowVersion: text("workflow_version"),
    repo: text("repo"),
    branch: text("branch"),
    repoCommitSha: text("repo_commit_sha"),
    issueOrTicketId: text("issue_or_ticket_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: text("status").notNull().default("running"),
    terminationReason: text("termination_reason"),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 20, scale: 8 }),
    actualCostUsd: numeric("actual_cost_usd", { precision: 20, scale: 8 }),
    reconciledCostUsd: numeric("reconciled_cost_usd", { precision: 20, scale: 8 }),
    budgetLimitUsd: numeric("budget_limit_usd", { precision: 20, scale: 8 }),
    freshInputTokens: integer("fresh_input_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    fallbackCount: integer("fallback_count").notNull().default(0),
    turnCount: integer("turn_count").notNull().default(0),
    finalArtifactType: text("final_artifact_type"),
    finalArtifactReference: text("final_artifact_reference"),
    outcomeStatus: text("outcome_status"),
    outcomeScore: numeric("outcome_score", { precision: 10, scale: 4 }),
    usageSource: text("usage_source").notNull().default("estimated"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("runs_org_started_idx").on(table.organizationId, table.startedAt),
    index("runs_project_started_idx").on(table.projectId, table.startedAt),
    index("runs_status_idx").on(table.organizationId, table.status),
  ],
);

export const turns = pgTable(
  "turns",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    turnIndex: integer("turn_index").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: text("status").notNull(),
    modelRequested: text("model_requested"),
    modelResolved: text("model_resolved"),
    reasoningEffort: text("reasoning_effort"),
    freshInputTokens: integer("fresh_input_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 20, scale: 8 }),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    fallbackCount: integer("fallback_count").notNull().default(0),
    latencyMs: integer("latency_ms"),
    timeToFirstTokenMs: integer("time_to_first_token_ms"),
    contextTokensBefore: integer("context_tokens_before"),
    contextTokensAfter: integer("context_tokens_after"),
    contextUtilizationPct: numeric("context_utilization_pct", { precision: 8, scale: 4 }),
    usageSource: text("usage_source").notNull().default("estimated"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("turns_run_index_uq").on(table.runId, table.turnIndex),
    index("turns_org_idx").on(table.organizationId),
  ],
);

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => turns.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    modelRequested: text("model_requested"),
    modelResolved: text("model_resolved"),
    providerRequestId: text("provider_request_id"),
    freshInputTokens: integer("fresh_input_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    audioInputTokens: integer("audio_input_tokens"),
    imageInputUnits: integer("image_input_units"),
    searchUnits: integer("search_units"),
    reasoningTokens: integer("reasoning_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 20, scale: 8 }),
    costSource: text("cost_source").notNull().default("estimated"),
    pricingVersion: text("pricing_version"),
    serviceTier: text("service_tier"),
    latencyMs: integer("latency_ms"),
    timeToFirstTokenMs: integer("time_to_first_token_ms"),
    statusCode: integer("status_code"),
    attemptIndex: integer("attempt_index").notNull().default(0),
    fallbackFromCallId: text("fallback_from_call_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [index("llm_calls_run_idx").on(table.runId), index("llm_calls_org_idx").on(table.organizationId)],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => turns.id, { onDelete: "cascade" }),
    parentLlmCallId: text("parent_llm_call_id").references(() => llmCalls.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    toolCategory: text("tool_category").notNull().default("other"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: text("status").notNull(),
    attemptIndex: integer("attempt_index").notNull().default(0),
    inputSizeBytes: integer("input_size_bytes"),
    outputSizeBytes: integer("output_size_bytes"),
    outputTokensEstimated: integer("output_tokens_estimated"),
    isRetry: boolean("is_retry").notNull().default(false),
    resourceHash: text("resource_hash"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [index("tool_calls_run_idx").on(table.runId), index("tool_calls_org_idx").on(table.organizationId)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    runId: text("run_id").references(() => runs.id, { onDelete: "cascade" }),
    sourceEventId: text("source_event_id").notNull(),
    source: text("source").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("usage_events_source_event_uq").on(table.organizationId, table.source, table.sourceEventId),
    index("usage_events_run_idx").on(table.runId),
    index("usage_events_org_time_idx").on(table.organizationId, table.occurredAt),
  ],
);

export const budgetDecisions = pgTable(
  "budget_decisions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => runs.id, { onDelete: "cascade" }),
    policyId: text("policy_id"),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    projectedCostUsd: numeric("projected_cost_usd", { precision: 20, scale: 8 }),
    observedCostUsd: numeric("observed_cost_usd", { precision: 20, scale: 8 }),
    decisionData: jsonb("decision_data").$type<Record<string, unknown>>().notNull().default({}),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [index("budget_decisions_run_idx").on(table.runId), index("budget_decisions_org_idx").on(table.organizationId)],
);

export const outcomes = pgTable(
  "outcomes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    score: numeric("score", { precision: 10, scale: 4 }),
    taskCompleted: boolean("task_completed"),
    testsPassed: boolean("tests_passed"),
    commitSha: text("commit_sha"),
    prNumber: integer("pr_number"),
    ciPassed: boolean("ci_passed"),
    merged: boolean("merged"),
    deploymentSuccessful: boolean("deployment_successful"),
    associationConfidence: numeric("association_confidence", { precision: 6, scale: 4 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [uniqueIndex("outcomes_run_uq").on(table.runId), index("outcomes_org_idx").on(table.organizationId)],
);

export const findings = pgTable(
  "findings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    estimatedWasteTokens: integer("estimated_waste_tokens"),
    estimatedWasteUsd: numeric("estimated_waste_usd", { precision: 20, scale: 8 }),
    confidence: text("confidence").notNull(),
    recommendation: text("recommendation").notNull(),
    verificationRecipe: text("verification_recipe").notNull(),
    ...timestamps,
  },
  (table) => [index("findings_run_idx").on(table.runId), index("findings_org_idx").on(table.organizationId)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id"),
    period: text("period").notNull().default("run"),
    limitUsd: numeric("limit_usd", { precision: 20, scale: 8 }),
    tokenLimit: integer("token_limit"),
    warnAtPct: numeric("warn_at_pct", { precision: 6, scale: 2 }).notNull().default("80"),
    hardStop: boolean("hard_stop").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("budgets_org_scope_idx").on(table.organizationId, table.scopeType, table.scopeId)],
);

export const policies = pgTable(
  "policies",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id"),
    priority: integer("priority").notNull().default(100),
    enabled: boolean("enabled").notNull().default(true),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (table) => [index("policies_org_scope_idx").on(table.organizationId, table.scopeType, table.scopeId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => runs.id, { onDelete: "cascade" }),
    policyId: text("policy_id").references(() => policies.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"),
    requestedBy: text("requested_by"),
    decidedBy: text("decided_by"),
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("approvals_org_status_idx").on(table.organizationId, table.status)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    ipHash: text("ip_hash"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_org_time_idx").on(table.organizationId, table.occurredAt)],
);

export type OrganizationRole = "owner" | "admin" | "finance" | "developer" | "viewer";
export type UsageSource = "provider_measured" | "agent_measured" | "local_tokenizer_reference" | "estimated" | "reconciled";
export type Plan = "free" | "pro" | "team" | "enterprise";
