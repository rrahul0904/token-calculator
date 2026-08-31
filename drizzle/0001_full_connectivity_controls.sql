CREATE TABLE IF NOT EXISTS api_key_quotas (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_key_id text NOT NULL UNIQUE REFERENCES api_keys(id) ON DELETE CASCADE,
  requests_per_minute integer NOT NULL DEFAULT 120 CHECK (requests_per_minute BETWEEN 1 AND 10000),
  monthly_token_limit integer CHECK (monthly_token_limit IS NULL OR monthly_token_limit > 0),
  monthly_cost_limit_usd numeric(20,8) CHECK (monthly_cost_limit_usd IS NULL OR monthly_cost_limit_usd > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_key_quotas_org_idx ON api_key_quotas(organization_id);

CREATE TABLE IF NOT EXISTS alert_endpoints (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'webhook' CHECK (kind IN ('webhook')),
  encrypted_url text NOT NULL,
  event_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  enabled boolean NOT NULL DEFAULT true,
  last_delivered_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_endpoints_org_idx ON alert_endpoints(organization_id);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  endpoint_id text REFERENCES alert_endpoints(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  status text NOT NULL CHECK (status IN ('delivered','failed','skipped')),
  status_code integer,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_deliveries_org_idx ON alert_deliveries(organization_id);
CREATE INDEX IF NOT EXISTS alert_deliveries_endpoint_idx ON alert_deliveries(endpoint_id);

-- Quota metering lives at the persistence boundary so streaming and future gateway
-- handlers cannot skip accounting. Unknown retry receipts have null usage/cost and
-- therefore deliberately do not turn an unknown charge into a false zero.
CREATE OR REPLACE FUNCTION token_intelligence_meter_api_key_usage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  key_id text;
  month_start timestamptz;
  month_end timestamptz;
  token_value numeric(24,6);
BEGIN
  SELECT metadata->>'apiKeyId' INTO key_id
  FROM runs
  WHERE id = NEW.run_id AND organization_id = NEW.organization_id;

  IF key_id IS NULL OR key_id = '' THEN
    RETURN NEW;
  END IF;

  month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_end := month_start + interval '1 month';
  token_value := COALESCE(NEW.fresh_input_tokens, 0)
    + COALESCE(NEW.cache_read_tokens, 0)
    + COALESCE(NEW.cache_write_tokens, 0)
    + COALESCE(NEW.reasoning_tokens, 0)
    + COALESCE(NEW.output_tokens, 0);

  IF token_value > 0 THEN
    INSERT INTO usage_counters (id, organization_id, scope_type, scope_id, metric, period_start, period_end, value, created_at, updated_at)
    VALUES ('quota:' || NEW.organization_id || ':' || key_id || ':gateway_tokens:' || month_start::text,
      NEW.organization_id, 'api_key', key_id, 'gateway_tokens', month_start, month_end, token_value, now(), now())
    ON CONFLICT (organization_id, scope_type, scope_id, metric, period_start)
    DO UPDATE SET value = usage_counters.value + EXCLUDED.value, updated_at = now();
  END IF;

  IF NEW.cost_usd IS NOT NULL AND NEW.cost_usd > 0 THEN
    INSERT INTO usage_counters (id, organization_id, scope_type, scope_id, metric, period_start, period_end, value, created_at, updated_at)
    VALUES ('quota:' || NEW.organization_id || ':' || key_id || ':gateway_cost_usd:' || month_start::text,
      NEW.organization_id, 'api_key', key_id, 'gateway_cost_usd', month_start, month_end, NEW.cost_usd, now(), now())
    ON CONFLICT (organization_id, scope_type, scope_id, metric, period_start)
    DO UPDATE SET value = usage_counters.value + EXCLUDED.value, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS token_intelligence_meter_api_key_usage_trigger ON llm_calls;
CREATE TRIGGER token_intelligence_meter_api_key_usage_trigger
AFTER INSERT ON llm_calls
FOR EACH ROW
EXECUTE FUNCTION token_intelligence_meter_api_key_usage();
