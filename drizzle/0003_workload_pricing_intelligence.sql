CREATE TABLE IF NOT EXISTS "inference_endpoints" (
  "id" text PRIMARY KEY NOT NULL,
  "canonical_model_id" text NOT NULL,
  "inference_provider" text NOT NULL,
  "external_model_id" text NOT NULL,
  "source" text NOT NULL,
  "context_window" integer,
  "max_output_tokens" integer,
  "status" text DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "inference_endpoints_source_external_uq" ON "inference_endpoints" ("source","external_model_id");
CREATE INDEX IF NOT EXISTS "inference_endpoints_model_idx" ON "inference_endpoints" ("canonical_model_id");

CREATE TABLE IF NOT EXISTS "pricing_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "source" text NOT NULL,
  "status" text DEFAULT 'candidate' NOT NULL,
  "payload_hash" text,
  "model_count" integer DEFAULT 0 NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone,
  "error" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "pricing_snapshots_source_published_idx" ON "pricing_snapshots" ("source","published_at");

CREATE TABLE IF NOT EXISTS "pricing_rates" (
  "id" text PRIMARY KEY NOT NULL,
  "snapshot_id" text NOT NULL REFERENCES "pricing_snapshots"("id") ON DELETE CASCADE,
  "endpoint_id" text NOT NULL REFERENCES "inference_endpoints"("id") ON DELETE CASCADE,
  "input_per_million" numeric(24,8),
  "cached_input_per_million" numeric(24,8),
  "cache_write_per_million" numeric(24,8),
  "output_per_million" numeric(24,8),
  "currency" text DEFAULT 'USD' NOT NULL,
  "source_url" text NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_rates_snapshot_endpoint_uq" ON "pricing_rates" ("snapshot_id","endpoint_id");
CREATE INDEX IF NOT EXISTS "pricing_rates_endpoint_idx" ON "pricing_rates" ("endpoint_id");

CREATE TABLE IF NOT EXISTS "pricing_overrides" (
  "id" text PRIMARY KEY NOT NULL,
  "endpoint_id" text NOT NULL REFERENCES "inference_endpoints"("id") ON DELETE CASCADE,
  "values" jsonb NOT NULL,
  "reason" text NOT NULL,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pricing_overrides_endpoint_idx" ON "pricing_overrides" ("endpoint_id","expires_at");

CREATE TABLE IF NOT EXISTS "scenario_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "scenario_id" text NOT NULL REFERENCES "saved_scenarios"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "pricing_snapshot_id" text REFERENCES "pricing_snapshots"("id") ON DELETE SET NULL,
  "assumptions" jsonb NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "scenario_versions_scenario_version_uq" ON "scenario_versions" ("scenario_id","version");
CREATE INDEX IF NOT EXISTS "scenario_versions_pricing_snapshot_idx" ON "scenario_versions" ("pricing_snapshot_id");
