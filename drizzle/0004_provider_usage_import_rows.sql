CREATE TABLE IF NOT EXISTS provider_usage_import_rows (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_id text NOT NULL REFERENCES provider_usage_imports(id) ON DELETE CASCADE,
  source_row integer NOT NULL,
  provider text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  cost_usd numeric(20,8),
  model text,
  user_reference text,
  api_key_reference text,
  project_reference text,
  run_reference text,
  tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_usage_import_rows_import_idx ON provider_usage_import_rows(import_id);
CREATE INDEX IF NOT EXISTS provider_usage_import_rows_org_period_idx ON provider_usage_import_rows(organization_id, period_start);
CREATE INDEX IF NOT EXISTS provider_usage_import_rows_run_idx ON provider_usage_import_rows(run_reference);

DROP TRIGGER IF EXISTS ti_provider_usage_import_rows_import_tenant ON provider_usage_import_rows;
CREATE TRIGGER ti_provider_usage_import_rows_import_tenant
BEFORE INSERT OR UPDATE OF import_id, organization_id ON provider_usage_import_rows
FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('provider_usage_imports', 'import_id');
