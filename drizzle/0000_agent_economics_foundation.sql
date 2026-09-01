CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  workos_user_id text UNIQUE,
  email text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  workos_organization_id text UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','team','enterprise')),
  retention_days integer NOT NULL DEFAULT 90 CHECK (retention_days >= 1),
  content_retention_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'developer' CHECK (role IN ('owner','admin','finance','developer','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members(user_id);

CREATE TABLE IF NOT EXISTS service_accounts (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_accounts_org_idx ON service_accounts(organization_id);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  archived_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS projects_org_idx ON projects(organization_id);

CREATE TABLE IF NOT EXISTS saved_scenarios (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  scenario jsonb NOT NULL,
  prompt_hash_a text,
  prompt_hash_b text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_scenarios_org_idx ON saved_scenarios(organization_id);
CREATE INDEX IF NOT EXISTS saved_scenarios_project_idx ON saved_scenarios(project_id);

CREATE TABLE IF NOT EXISTS prompt_comparisons (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  scenario_id text REFERENCES saved_scenarios(id) ON DELETE SET NULL,
  metrics jsonb NOT NULL,
  outcome_equivalent boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prompt_comparisons_org_idx ON prompt_comparisons(organization_id);

CREATE TABLE IF NOT EXISTS billing_customers (
  id text PRIMARY KEY,
  organization_id text NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_price_id text,
  plan text NOT NULL CHECK (plan IN ('free','pro','team','enterprise')),
  status text NOT NULL,
  seats integer NOT NULL DEFAULT 1 CHECK (seats >= 1),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_org_idx ON subscriptions(organization_id);

CREATE TABLE IF NOT EXISTS entitlement_overrides (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS usage_counters (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope_type text NOT NULL,
  scope_id text NOT NULL,
  metric text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  value numeric(24,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, scope_type, scope_id, metric, period_start)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  service_account_id text REFERENCES service_accounts(id) ON DELETE SET NULL,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  environment text NOT NULL DEFAULT 'live' CHECK (environment IN ('live','test')),
  prefix text NOT NULL UNIQUE,
  last_four text NOT NULL,
  secret_hash text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys(organization_id);

CREATE TABLE IF NOT EXISTS integration_installations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured',
  external_id text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);

CREATE TABLE IF NOT EXISTS provider_connections (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  label text NOT NULL,
  encrypted_credential text NOT NULL,
  credential_key_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_connections_org_idx ON provider_connections(organization_id);

CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  developer_user_id text REFERENCES users(id) ON DELETE SET NULL,
  service_account_id text REFERENCES service_accounts(id) ON DELETE SET NULL,
  environment text NOT NULL DEFAULT 'development',
  agent_name text NOT NULL,
  agent_vendor text,
  agent_version text,
  workflow_name text,
  workflow_version text,
  repo text,
  branch text,
  repo_commit_sha text,
  issue_or_ticket_id text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  termination_reason text,
  estimated_cost_usd numeric(20,8),
  actual_cost_usd numeric(20,8),
  reconciled_cost_usd numeric(20,8),
  budget_limit_usd numeric(20,8),
  fresh_input_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  reasoning_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  tool_call_count integer NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0,
  fallback_count integer NOT NULL DEFAULT 0,
  turn_count integer NOT NULL DEFAULT 0,
  final_artifact_type text,
  final_artifact_reference text,
  outcome_status text,
  outcome_score numeric(10,4),
  usage_source text NOT NULL DEFAULT 'estimated' CHECK (usage_source IN ('provider_measured','agent_measured','local_tokenizer_reference','estimated','reconciled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_org_started_idx ON runs(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS runs_project_started_idx ON runs(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS runs_status_idx ON runs(organization_id, status);

CREATE TABLE IF NOT EXISTS turns (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','completed','aborted','compacted','failed')),
  model_requested text,
  model_resolved text,
  reasoning_effort text,
  fresh_input_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  reasoning_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(20,8),
  tool_call_count integer NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0,
  fallback_count integer NOT NULL DEFAULT 0,
  latency_ms integer,
  time_to_first_token_ms integer,
  context_tokens_before integer,
  context_tokens_after integer,
  context_utilization_pct numeric(8,4),
  usage_source text NOT NULL DEFAULT 'estimated' CHECK (usage_source IN ('provider_measured','agent_measured','local_tokenizer_reference','estimated','reconciled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, turn_index)
);
CREATE INDEX IF NOT EXISTS turns_org_idx ON turns(organization_id);

CREATE TABLE IF NOT EXISTS llm_calls (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  turn_id text REFERENCES turns(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model_requested text,
  model_resolved text,
  provider_request_id text,
  fresh_input_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  audio_input_tokens integer,
  image_input_units integer,
  search_units integer,
  reasoning_tokens integer,
  output_tokens integer,
  cost_usd numeric(20,8),
  cost_source text NOT NULL DEFAULT 'estimated',
  pricing_version text,
  service_tier text,
  latency_ms integer,
  time_to_first_token_ms integer,
  status_code integer,
  attempt_index integer NOT NULL DEFAULT 0,
  fallback_from_call_id text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS llm_calls_run_idx ON llm_calls(run_id);
CREATE INDEX IF NOT EXISTS llm_calls_org_idx ON llm_calls(organization_id);

CREATE TABLE IF NOT EXISTS tool_calls (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  turn_id text REFERENCES turns(id) ON DELETE CASCADE,
  parent_llm_call_id text REFERENCES llm_calls(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  tool_category text NOT NULL DEFAULT 'other',
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  status text NOT NULL,
  attempt_index integer NOT NULL DEFAULT 0,
  input_size_bytes integer,
  output_size_bytes integer,
  output_tokens_estimated integer,
  is_retry boolean NOT NULL DEFAULT false,
  resource_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_calls_run_idx ON tool_calls(run_id);
CREATE INDEX IF NOT EXISTS tool_calls_org_idx ON tool_calls(organization_id);

CREATE TABLE IF NOT EXISTS usage_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  run_id text REFERENCES runs(id) ON DELETE CASCADE,
  source_event_id text NOT NULL,
  source text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source, source_event_id)
);
CREATE INDEX IF NOT EXISTS usage_events_run_idx ON usage_events(run_id);
CREATE INDEX IF NOT EXISTS usage_events_org_time_idx ON usage_events(organization_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS budgets (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  scope_type text NOT NULL,
  scope_id text,
  period text NOT NULL DEFAULT 'run',
  limit_usd numeric(20,8),
  token_limit integer,
  warn_at_pct numeric(6,2) NOT NULL DEFAULT 80,
  hard_stop boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budgets_org_scope_idx ON budgets(organization_id, scope_type, scope_id);

CREATE TABLE IF NOT EXISTS policies (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  scope_type text NOT NULL,
  scope_id text,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  rules jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policies_org_scope_idx ON policies(organization_id, scope_type, scope_id);

CREATE TABLE IF NOT EXISTS budget_decisions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id text REFERENCES runs(id) ON DELETE CASCADE,
  policy_id text REFERENCES policies(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('ALLOW','WARN','NOTIFY','REQUIRE_APPROVAL','DISABLE_FALLBACK','BLOCK_NEXT_CALL','KILL_RUN')),
  reason text NOT NULL,
  projected_cost_usd numeric(20,8),
  observed_cost_usd numeric(20,8),
  decision_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budget_decisions_run_idx ON budget_decisions(run_id);
CREATE INDEX IF NOT EXISTS budget_decisions_org_idx ON budget_decisions(organization_id);

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id text REFERENCES runs(id) ON DELETE CASCADE,
  policy_id text REFERENCES policies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
  requested_by text,
  decided_by text,
  reason text,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_org_status_idx ON approvals(organization_id, status);

CREATE TABLE IF NOT EXISTS outcomes (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id text NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  status text NOT NULL,
  score numeric(10,4),
  task_completed boolean,
  tests_passed boolean,
  commit_sha text,
  pr_number integer,
  ci_passed boolean,
  merged boolean,
  deployment_successful boolean,
  association_confidence numeric(6,4),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outcomes_org_idx ON outcomes(organization_id);

CREATE TABLE IF NOT EXISTS findings (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  evidence jsonb NOT NULL,
  estimated_waste_tokens integer,
  estimated_waste_usd numeric(20,8),
  confidence text NOT NULL,
  recommendation text NOT NULL,
  verification_recipe text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS findings_run_idx ON findings(run_id);
CREATE INDEX IF NOT EXISTS findings_org_idx ON findings(organization_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  ip_hash text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_org_time_idx ON audit_events(organization_id, occurred_at DESC);
