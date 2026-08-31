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
