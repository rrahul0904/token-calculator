import process from "node:process";
import postgres from "postgres";

const requiredTables = [
  "users", "organizations", "organization_members", "service_accounts", "projects",
  "saved_scenarios", "prompt_comparisons", "billing_customers", "subscriptions", "entitlement_overrides",
  "usage_counters", "api_keys", "api_key_quotas", "integration_installations", "provider_connections",
  "runs", "turns", "llm_calls", "tool_calls", "usage_events", "budget_decisions", "outcomes", "findings",
  "budgets", "policies", "approvals", "audit_events", "alert_endpoints", "alert_deliveries",
  "teams", "team_members", "project_teams", "cost_center_assignments", "pricing_snapshots",
  "provider_usage_imports", "provider_usage_import_rows", "anomalies", "prompt_config_versions", "run_config_attributions",
  "evaluation_datasets", "evaluation_cases", "experiments", "experiment_results",
  "workos_directory_events", "workos_directory_users", "workos_directory_groups", "organization_data_controls",
  "_token_intelligence_migrations",
];

const requiredMigrations = [
  "0000_agent_economics_foundation.sql",
  "0001_full_connectivity_controls.sql",
  "0002_tenant_reference_guards.sql",
  "0003_gap_closure_foundations.sql",
  "0004_provider_usage_import_rows.sql",
  "0005_enterprise_directory_lifecycle.sql",
  "0006_data_controls.sql",
];

const requiredTriggers = [
  "token_intelligence_meter_api_key_usage_trigger",
  "ti_team_members_team_tenant",
  "ti_project_teams_project_tenant",
  "ti_project_teams_team_tenant",
  "ti_prompt_config_versions_project_tenant",
  "ti_run_config_attributions_run_tenant",
  "ti_run_config_attributions_version_tenant",
  "ti_evaluation_datasets_project_tenant",
  "ti_evaluation_cases_dataset_tenant",
  "ti_experiments_project_tenant",
  "ti_experiments_dataset_tenant",
  "ti_experiment_results_experiment_tenant",
  "ti_experiment_results_run_tenant",
  "ti_provider_usage_import_rows_import_tenant",
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    connect_timeout: 15,
  });

  try {
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public'
    `;
    const names = new Set(tables.map((row) => row.table_name));
    const missing = requiredTables.filter((name) => !names.has(name));
    if (missing.length) throw new Error(`MISSING_TABLES:${missing.join(",")}`);

    const migrationRows = await sql<{ name: string; checksum: string }[]>`
      select name, checksum from _token_intelligence_migrations order by name
    `;
    for (const name of requiredMigrations) {
      if (!migrationRows.some((row) => row.name === name)) throw new Error(`MISSING_MIGRATION_RECORD:${name}`);
    }

    const triggerRows = await sql<{ trigger_name: string }[]>`
      select distinct trigger_name from information_schema.triggers
      where trigger_schema = 'public'
    `;
    const triggerNames = new Set(triggerRows.map((row) => row.trigger_name));
    const missingTriggers = requiredTriggers.filter((name) => !triggerNames.has(name));
    if (missingTriggers.length) throw new Error(`MISSING_REQUIRED_TRIGGERS:${missingTriggers.join(",")}`);

    const foreignKeyRows = await sql<{ count: string }[]>`
      select count(*)::text as count
      from information_schema.table_constraints
      where constraint_schema = 'public' and constraint_type = 'FOREIGN KEY'
    `;

    console.log(JSON.stringify({
      ok: true,
      tables: requiredTables.length,
      migrations: migrationRows.map((row) => ({ name: row.name, checksum: row.checksum })),
      requiredTriggers: requiredTriggers.length,
      foreignKeys: Number(foreignKeyRows[0]?.count ?? 0),
    }, null, 2));
  } finally {
    await sql.end({ timeout: 3 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
