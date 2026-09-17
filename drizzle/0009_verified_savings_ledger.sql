CREATE TABLE IF NOT EXISTS "verified_savings" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "experiment_id" text NOT NULL REFERENCES "experiments"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "evidence_type" text DEFAULT 'experiment_verified' NOT NULL,
  "evidence_hash" text NOT NULL,
  "baseline_median_cost_usd" numeric(20,8) NOT NULL,
  "candidate_median_cost_usd" numeric(20,8) NOT NULL,
  "savings_per_observation_usd" numeric(20,8) NOT NULL,
  "savings_pct" numeric(12,6),
  "baseline_median_quality" numeric(10,4) NOT NULL,
  "candidate_median_quality" numeric(10,4) NOT NULL,
  "baseline_success_rate" numeric(10,6) NOT NULL,
  "candidate_success_rate" numeric(10,6) NOT NULL,
  "baseline_sample_size" integer NOT NULL,
  "candidate_sample_size" integer NOT NULL,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "verified_savings_experiment_version_uq" ON "verified_savings" ("experiment_id","version");
CREATE UNIQUE INDEX IF NOT EXISTS "verified_savings_experiment_evidence_hash_uq" ON "verified_savings" ("experiment_id","evidence_hash");
CREATE INDEX IF NOT EXISTS "verified_savings_org_verified_idx" ON "verified_savings" ("organization_id","verified_at");

DROP TRIGGER IF EXISTS ti_verified_savings_experiment_tenant ON verified_savings;
CREATE TRIGGER ti_verified_savings_experiment_tenant
BEFORE INSERT OR UPDATE OF experiment_id, organization_id ON verified_savings
FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('experiments', 'experiment_id');
