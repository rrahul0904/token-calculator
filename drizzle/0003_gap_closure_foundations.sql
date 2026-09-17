-- Reverse-engineering gap-closure foundations.
-- This migration is additive and metadata-first. It does not enable content retention.

CREATE TABLE IF NOT EXISTS teams (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  cost_center text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS teams_org_slug_uq ON teams(organization_id, slug);
CREATE INDEX IF NOT EXISTS teams_org_idx ON teams(organization_id);

CREATE TABLE IF NOT EXISTS team_members (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_user_uq ON team_members(team_id, user_id);
CREATE INDEX IF NOT EXISTS team_members_org_idx ON team_members(organization_id);

CREATE TABLE IF NOT EXISTS project_teams (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_teams_project_team_uq ON project_teams(project_id, team_id);
CREATE INDEX IF NOT EXISTS project_teams_org_idx ON project_teams(organization_id);

CREATE TABLE IF NOT EXISTS cost_center_assignments (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope_type text NOT NULL,
  scope_id text NOT NULL,
  cost_center text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cost_center_assignments_scope_uq ON cost_center_assignments(organization_id, scope_type, scope_id);
CREATE INDEX IF NOT EXISTS cost_center_assignments_org_idx ON cost_center_assignments(organization_id);

CREATE TABLE IF NOT EXISTS pricing_snapshots (
  id text PRIMARY KEY,
  pricing_version text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  source_url text NOT NULL,
  verified_at timestamptz NOT NULL,
  input_per_million_usd numeric(20,8) NOT NULL,
  cache_read_per_million_usd numeric(20,8),
  cache_write_per_million_usd numeric(20,8),
  output_per_million_usd numeric(20,8) NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  long_context_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  catalog_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pricing_snapshots_version_provider_model_uq ON pricing_snapshots(pricing_version, provider, model);
CREATE INDEX IF NOT EXISTS pricing_snapshots_model_effective_idx ON pricing_snapshots(provider, model, effective_from);

CREATE TABLE IF NOT EXISTS provider_usage_imports (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  source_identity text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  source_hash text NOT NULL,
  status text NOT NULL DEFAULT 'previewed',
  total_cost_usd numeric(20,8),
  row_count integer NOT NULL DEFAULT 0,
  provenance text NOT NULL DEFAULT 'provider_imported',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_usage_imports_org_source_hash_uq ON provider_usage_imports(organization_id, source_hash);
CREATE INDEX IF NOT EXISTS provider_usage_imports_org_period_idx ON provider_usage_imports(organization_id, period_start);

CREATE TABLE IF NOT EXISTS anomalies (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope_type text NOT NULL,
  scope_id text,
  metric text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  baseline numeric(24,8) NOT NULL,
  observed numeric(24,8) NOT NULL,
  delta numeric(24,8) NOT NULL,
  threshold numeric(24,8) NOT NULL,
  confidence text NOT NULL,
  method text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS anomalies_org_period_idx ON anomalies(organization_id, period_start);

CREATE TABLE IF NOT EXISTS prompt_config_versions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  identity text NOT NULL,
  version text NOT NULL,
  content_hash text NOT NULL,
  label text,
  deployment_environment text,
  model_route text,
  context_bundle_version text,
  skill_version text,
  agent_config_version text,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  content_stored boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prompt_config_versions_identity_version_uq ON prompt_config_versions(organization_id, kind, identity, version);
CREATE INDEX IF NOT EXISTS prompt_config_versions_org_idx ON prompt_config_versions(organization_id);

CREATE TABLE IF NOT EXISTS run_config_attributions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  prompt_config_version_id text NOT NULL REFERENCES prompt_config_versions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS run_config_attributions_run_version_uq ON run_config_attributions(run_id, prompt_config_version_id);
CREATE INDEX IF NOT EXISTS run_config_attributions_org_idx ON run_config_attributions(organization_id);

CREATE TABLE IF NOT EXISTS evaluation_datasets (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  content_retention_mode text NOT NULL DEFAULT 'metadata_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_datasets_org_name_version_uq ON evaluation_datasets(organization_id, name, version);

CREATE TABLE IF NOT EXISTS evaluation_cases (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dataset_id text NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
  input_reference text NOT NULL,
  expected_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evaluation_cases_dataset_idx ON evaluation_cases(dataset_id);

CREATE TABLE IF NOT EXISTS experiments (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  dataset_id text NOT NULL REFERENCES evaluation_datasets(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  baseline_config jsonb NOT NULL,
  candidate_config jsonb NOT NULL,
  quality_threshold numeric(10,4),
  max_cost_regression_pct numeric(10,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiments_org_idx ON experiments(organization_id);

CREATE TABLE IF NOT EXISTS experiment_results (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  experiment_id text NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  variant text NOT NULL,
  case_id text REFERENCES evaluation_cases(id) ON DELETE SET NULL,
  run_id text REFERENCES runs(id) ON DELETE SET NULL,
  quality_score numeric(10,4),
  cost_usd numeric(20,8),
  tokens integer,
  latency_ms integer,
  retries integer NOT NULL DEFAULT 0,
  fallbacks integer NOT NULL DEFAULT 0,
  success boolean,
  evaluator_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiment_results_experiment_idx ON experiment_results(experiment_id);

-- Reuse the Wave 4 persistence-layer tenant assertion function.
DROP TRIGGER IF EXISTS ti_team_members_team_tenant ON team_members;
CREATE TRIGGER ti_team_members_team_tenant BEFORE INSERT OR UPDATE OF team_id, organization_id ON team_members FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('teams', 'team_id');
DROP TRIGGER IF EXISTS ti_project_teams_project_tenant ON project_teams;
CREATE TRIGGER ti_project_teams_project_tenant BEFORE INSERT OR UPDATE OF project_id, organization_id ON project_teams FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('projects', 'project_id');
DROP TRIGGER IF EXISTS ti_project_teams_team_tenant ON project_teams;
CREATE TRIGGER ti_project_teams_team_tenant BEFORE INSERT OR UPDATE OF team_id, organization_id ON project_teams FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('teams', 'team_id');
DROP TRIGGER IF EXISTS ti_prompt_config_versions_project_tenant ON prompt_config_versions;
CREATE TRIGGER ti_prompt_config_versions_project_tenant BEFORE INSERT OR UPDATE OF project_id, organization_id ON prompt_config_versions FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('projects', 'project_id');
DROP TRIGGER IF EXISTS ti_run_config_attributions_run_tenant ON run_config_attributions;
CREATE TRIGGER ti_run_config_attributions_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON run_config_attributions FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');
DROP TRIGGER IF EXISTS ti_run_config_attributions_version_tenant ON run_config_attributions;
CREATE TRIGGER ti_run_config_attributions_version_tenant BEFORE INSERT OR UPDATE OF prompt_config_version_id, organization_id ON run_config_attributions FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('prompt_config_versions', 'prompt_config_version_id');
DROP TRIGGER IF EXISTS ti_evaluation_datasets_project_tenant ON evaluation_datasets;
CREATE TRIGGER ti_evaluation_datasets_project_tenant BEFORE INSERT OR UPDATE OF project_id, organization_id ON evaluation_datasets FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('projects', 'project_id');
DROP TRIGGER IF EXISTS ti_evaluation_cases_dataset_tenant ON evaluation_cases;
CREATE TRIGGER ti_evaluation_cases_dataset_tenant BEFORE INSERT OR UPDATE OF dataset_id, organization_id ON evaluation_cases FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('evaluation_datasets', 'dataset_id');
DROP TRIGGER IF EXISTS ti_experiments_project_tenant ON experiments;
CREATE TRIGGER ti_experiments_project_tenant BEFORE INSERT OR UPDATE OF project_id, organization_id ON experiments FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('projects', 'project_id');
DROP TRIGGER IF EXISTS ti_experiments_dataset_tenant ON experiments;
CREATE TRIGGER ti_experiments_dataset_tenant BEFORE INSERT OR UPDATE OF dataset_id, organization_id ON experiments FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('evaluation_datasets', 'dataset_id');
DROP TRIGGER IF EXISTS ti_experiment_results_experiment_tenant ON experiment_results;
CREATE TRIGGER ti_experiment_results_experiment_tenant BEFORE INSERT OR UPDATE OF experiment_id, organization_id ON experiment_results FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('experiments', 'experiment_id');
DROP TRIGGER IF EXISTS ti_experiment_results_run_tenant ON experiment_results;
CREATE TRIGGER ti_experiment_results_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON experiment_results FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');
