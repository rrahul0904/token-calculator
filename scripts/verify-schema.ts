import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1, ssl: process.env.DATABASE_SSL === "disable" ? false : "require", connect_timeout: 15 });

const requiredTables = [
  "users", "organizations", "organization_members", "service_accounts", "projects",
  "saved_scenarios", "prompt_comparisons", "billing_customers", "subscriptions", "entitlement_overrides",
  "usage_counters", "api_keys", "api_key_quotas", "integration_installations", "provider_connections",
  "runs", "turns", "llm_calls", "tool_calls", "usage_events", "budget_decisions", "outcomes", "findings",
  "budgets", "policies", "approvals", "audit_events", "alert_endpoints", "alert_deliveries",
  "_token_intelligence_migrations",
];

try {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public'
  `;
  const names = new Set(tables.map((row) => row.table_name));
  const missing = requiredTables.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`MISSING_TABLES:${missing.join(",")}`);

  const migrationRows = await sql<{ name: string }[]>`select name from _token_intelligence_migrations order by name`;
  for (const name of ["0000_agent_economics_foundation.sql", "0001_full_connectivity_controls.sql"]) {
    if (!migrationRows.some((row) => row.name === name)) throw new Error(`MISSING_MIGRATION_RECORD:${name}`);
  }

  const triggerRows = await sql<{ trigger_name: string }[]>`
    select trigger_name from information_schema.triggers
    where event_object_schema = 'public' and event_object_table = 'llm_calls'
  `;
  if (!triggerRows.some((row) => row.trigger_name === "token_intelligence_meter_api_key_usage_trigger")) {
    throw new Error("MISSING_QUOTA_METER_TRIGGER");
  }

  const crossTenantForeignKeys = await sql<{ count: string }[]>`
    select count(*)::text as count
    from information_schema.table_constraints
    where constraint_schema = 'public' and constraint_type = 'FOREIGN KEY'
  `;
  console.log(JSON.stringify({ ok: true, tables: requiredTables.length, migrations: migrationRows.map((row) => row.name), llmCallTriggers: triggerRows.map((row) => row.trigger_name), foreignKeys: Number(crossTenantForeignKeys[0]?.count ?? 0) }, null, 2));
} finally {
  await sql.end({ timeout: 3 });
}
