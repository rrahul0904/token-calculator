-- Defense in depth: child records often contain both organization_id and a parent
-- reference. Ordinary foreign keys guarantee that the parent exists but do not
-- guarantee that the redundant organization_id belongs to the same tenant.
-- This reusable trigger rejects cross-tenant references at the persistence layer.
CREATE OR REPLACE FUNCTION token_intelligence_assert_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_table text := TG_ARGV[0];
  reference_field text := TG_ARGV[1];
  reference_id text;
  child_org text;
  valid_reference boolean;
BEGIN
  reference_id := to_jsonb(NEW)->>reference_field;
  child_org := to_jsonb(NEW)->>'organization_id';

  IF reference_id IS NULL OR reference_id = '' THEN
    RETURN NEW;
  END IF;
  IF child_org IS NULL OR child_org = '' THEN
    RAISE EXCEPTION 'TENANT_REFERENCE_MISSING_ORGANIZATION:%:%', TG_TABLE_NAME, reference_field USING ERRCODE = '23514';
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND organization_id = $2)', parent_table)
    INTO valid_reference
    USING reference_id, child_org;

  IF NOT valid_reference THEN
    RAISE EXCEPTION 'TENANT_REFERENCE_MISMATCH:%:%', TG_TABLE_NAME, reference_field USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Project-bound records
DROP TRIGGER IF EXISTS ti_saved_scenarios_project_tenant ON saved_scenarios;
CREATE TRIGGER ti_saved_scenarios_project_tenant BEFORE INSERT OR UPDATE OF project_id, organization_id ON saved_scenarios FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('projects', 'project_id');
DROP TRIGGER IF EXISTS ti_prompt_comparisons_project_tenant ON prompt_comparisons;
CREATE TRIGGER ti_prompt_comparisons_project_tenant BEFORE INSERT OR UPDATE OF project_id, organization_id ON prompt_comparisons FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('projects', 'project_id');
DROP TRIGGER IF EXISTS ti_api_keys_project_tenant ON api_keys;
CREATE TRIGGER ti_api_keys_project_tenant BEFORE INSERT OR UPDATE OF project_id, organization_id ON api_keys FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('projects', 'project_id');
DROP TRIGGER IF EXISTS ti_runs_project_tenant ON runs;
CREATE TRIGGER ti_runs_project_tenant BEFORE INSERT OR UPDATE OF project_id, organization_id ON runs FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('projects', 'project_id');
DROP TRIGGER IF EXISTS ti_usage_events_project_tenant ON usage_events;
CREATE TRIGGER ti_usage_events_project_tenant BEFORE INSERT OR UPDATE OF project_id, organization_id ON usage_events FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('projects', 'project_id');

-- Service-account-bound records
DROP TRIGGER IF EXISTS ti_api_keys_service_account_tenant ON api_keys;
CREATE TRIGGER ti_api_keys_service_account_tenant BEFORE INSERT OR UPDATE OF service_account_id, organization_id ON api_keys FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('service_accounts', 'service_account_id');
DROP TRIGGER IF EXISTS ti_runs_service_account_tenant ON runs;
CREATE TRIGGER ti_runs_service_account_tenant BEFORE INSERT OR UPDATE OF service_account_id, organization_id ON runs FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('service_accounts', 'service_account_id');

-- Run/turn/call lineage
DROP TRIGGER IF EXISTS ti_turns_run_tenant ON turns;
CREATE TRIGGER ti_turns_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON turns FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');
DROP TRIGGER IF EXISTS ti_llm_calls_run_tenant ON llm_calls;
CREATE TRIGGER ti_llm_calls_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON llm_calls FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');
DROP TRIGGER IF EXISTS ti_llm_calls_turn_tenant ON llm_calls;
CREATE TRIGGER ti_llm_calls_turn_tenant BEFORE INSERT OR UPDATE OF turn_id, organization_id ON llm_calls FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('turns', 'turn_id');
DROP TRIGGER IF EXISTS ti_tool_calls_run_tenant ON tool_calls;
CREATE TRIGGER ti_tool_calls_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON tool_calls FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');
DROP TRIGGER IF EXISTS ti_tool_calls_turn_tenant ON tool_calls;
CREATE TRIGGER ti_tool_calls_turn_tenant BEFORE INSERT OR UPDATE OF turn_id, organization_id ON tool_calls FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('turns', 'turn_id');
DROP TRIGGER IF EXISTS ti_tool_calls_llm_tenant ON tool_calls;
CREATE TRIGGER ti_tool_calls_llm_tenant BEFORE INSERT OR UPDATE OF parent_llm_call_id, organization_id ON tool_calls FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('llm_calls', 'parent_llm_call_id');
DROP TRIGGER IF EXISTS ti_usage_events_run_tenant ON usage_events;
CREATE TRIGGER ti_usage_events_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON usage_events FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');
DROP TRIGGER IF EXISTS ti_budget_decisions_run_tenant ON budget_decisions;
CREATE TRIGGER ti_budget_decisions_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON budget_decisions FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');
DROP TRIGGER IF EXISTS ti_outcomes_run_tenant ON outcomes;
CREATE TRIGGER ti_outcomes_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON outcomes FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');
DROP TRIGGER IF EXISTS ti_findings_run_tenant ON findings;
CREATE TRIGGER ti_findings_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON findings FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');
DROP TRIGGER IF EXISTS ti_approvals_run_tenant ON approvals;
CREATE TRIGGER ti_approvals_run_tenant BEFORE INSERT OR UPDATE OF run_id, organization_id ON approvals FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('runs', 'run_id');

-- Control-plane child tables added in Wave 3/4
DROP TRIGGER IF EXISTS ti_api_key_quotas_key_tenant ON api_key_quotas;
CREATE TRIGGER ti_api_key_quotas_key_tenant BEFORE INSERT OR UPDATE OF api_key_id, organization_id ON api_key_quotas FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('api_keys', 'api_key_id');
DROP TRIGGER IF EXISTS ti_alert_deliveries_endpoint_tenant ON alert_deliveries;
CREATE TRIGGER ti_alert_deliveries_endpoint_tenant BEFORE INSERT OR UPDATE OF endpoint_id, organization_id ON alert_deliveries FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('alert_endpoints', 'endpoint_id');
