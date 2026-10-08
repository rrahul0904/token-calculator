CREATE TABLE IF NOT EXISTS "provider_quota_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" text REFERENCES "projects"("id") ON DELETE SET NULL,
  "provider" text NOT NULL,
  "auth_state" text NOT NULL,
  "source" text NOT NULL DEFAULT 'provider_reported',
  "fetched_at" timestamptz NOT NULL,
  "account_ref" text,
  "plan" text,
  "windows" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "provider_quota_snapshots_observation_unique"
    UNIQUE NULLS NOT DISTINCT ("organization_id", "project_id", "provider", "fetched_at", "account_ref")
);

CREATE INDEX IF NOT EXISTS "provider_quota_snapshots_org_fetched_idx"
  ON "provider_quota_snapshots" ("organization_id", "fetched_at");
CREATE INDEX IF NOT EXISTS "provider_quota_snapshots_org_provider_fetched_idx"
  ON "provider_quota_snapshots" ("organization_id", "provider", "fetched_at");
CREATE INDEX IF NOT EXISTS "provider_quota_snapshots_project_fetched_idx"
  ON "provider_quota_snapshots" ("project_id", "fetched_at");
