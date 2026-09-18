ALTER TABLE "outcomes" ADD COLUMN IF NOT EXISTS "ci_provider" text;
ALTER TABLE "outcomes" ADD COLUMN IF NOT EXISTS "ci_run_id" text;
ALTER TABLE "outcomes" ADD COLUMN IF NOT EXISTS "deployment_provider" text;
ALTER TABLE "outcomes" ADD COLUMN IF NOT EXISTS "deployment_id" text;
ALTER TABLE "outcomes" ADD COLUMN IF NOT EXISTS "deployment_environment" text;
ALTER TABLE "outcomes" ADD COLUMN IF NOT EXISTS "deployed_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "outcomes_ci_run_idx"
  ON "outcomes" ("organization_id", "ci_provider", "ci_run_id");

CREATE INDEX IF NOT EXISTS "outcomes_deployment_idx"
  ON "outcomes" ("organization_id", "deployment_provider", "deployment_id");
