ALTER TABLE "experiment_results"
  ADD COLUMN IF NOT EXISTS "economics_source" text DEFAULT 'unknown' NOT NULL;

ALTER TABLE "experiment_results"
  ADD COLUMN IF NOT EXISTS "measurement_scope" text DEFAULT 'unknown' NOT NULL;

ALTER TABLE "experiment_results"
  ADD COLUMN IF NOT EXISTS "benchmark_context" jsonb DEFAULT '{}'::jsonb NOT NULL;
