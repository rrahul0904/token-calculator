CREATE TABLE IF NOT EXISTS economic_ledger_rows (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_provider text NOT NULL,
  source_external_id text NOT NULL,
  source_currency text,
  source_amount_minor numeric(30, 0),
  economic_role text NOT NULL,
  amount_usd numeric(20, 8),
  product_reference text,
  customer_reference text,
  plan_reference text,
  task_reference text,
  provider text,
  cost_purpose text,
  evidence text NOT NULL,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT economic_ledger_rows_source_amount_nonnegative_ck
    CHECK (source_amount_minor IS NULL OR source_amount_minor >= 0),
  CONSTRAINT economic_ledger_rows_amount_usd_nonnegative_ck
    CHECK (amount_usd IS NULL OR amount_usd >= 0),
  CONSTRAINT economic_ledger_rows_role_ck
    CHECK (economic_role IN ('gross_revenue', 'processor_fee', 'refund', 'variable_cost', 'fixed_cost')),
  CONSTRAINT economic_ledger_rows_cost_purpose_ck
    CHECK (
      cost_purpose IS NULL OR cost_purpose IN (
        'paid_service', 'free_trial', 'acquisition', 'rd_testing', 'shared', 'fixed_overhead', 'unknown'
      )
    ),
  CONSTRAINT economic_ledger_rows_evidence_ck
    CHECK (evidence IN ('provider_measured', 'platform_recorded', 'user_entered', 'estimated', 'reconciled', 'unknown'))
);

CREATE UNIQUE INDEX IF NOT EXISTS economic_ledger_rows_org_source_uq
  ON economic_ledger_rows (organization_id, source_provider, source_external_id);

CREATE INDEX IF NOT EXISTS economic_ledger_rows_org_occurred_idx
  ON economic_ledger_rows (organization_id, occurred_at);

CREATE INDEX IF NOT EXISTS economic_ledger_rows_product_idx
  ON economic_ledger_rows (organization_id, product_reference);

CREATE INDEX IF NOT EXISTS economic_ledger_rows_customer_idx
  ON economic_ledger_rows (organization_id, customer_reference);

CREATE INDEX IF NOT EXISTS economic_ledger_rows_role_idx
  ON economic_ledger_rows (organization_id, economic_role);
