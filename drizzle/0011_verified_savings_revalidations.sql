CREATE TABLE IF NOT EXISTS "verified_savings_revalidations" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "experiment_id" text NOT NULL REFERENCES "experiments"("id") ON DELETE CASCADE,
  "verified_savings_id" text NOT NULL REFERENCES "verified_savings"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "evidence_type" text NOT NULL,
  "current_evidence_hash" text NOT NULL,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "verified_savings_revalidations_org_checked_idx"
  ON "verified_savings_revalidations" ("organization_id","checked_at");
CREATE INDEX IF NOT EXISTS "verified_savings_revalidations_experiment_checked_idx"
  ON "verified_savings_revalidations" ("experiment_id","checked_at");

DROP TRIGGER IF EXISTS ti_verified_savings_revalidations_experiment_tenant ON verified_savings_revalidations;
CREATE TRIGGER ti_verified_savings_revalidations_experiment_tenant
BEFORE INSERT OR UPDATE OF experiment_id, organization_id ON verified_savings_revalidations
FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('experiments', 'experiment_id');

DROP TRIGGER IF EXISTS ti_verified_savings_revalidations_snapshot_tenant ON verified_savings_revalidations;
CREATE TRIGGER ti_verified_savings_revalidations_snapshot_tenant
BEFORE INSERT OR UPDATE OF verified_savings_id, organization_id ON verified_savings_revalidations
FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('verified_savings', 'verified_savings_id');
