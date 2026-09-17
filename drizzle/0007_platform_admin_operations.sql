CREATE TABLE IF NOT EXISTS "platform_admins" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE set null,
  "workos_user_id" text NOT NULL,
  "role" text NOT NULL,
  "created_by" text REFERENCES "users"("id") ON DELETE set null,
  "disabled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_admins_role_ck" CHECK ("role" IN ('super_admin', 'operations', 'finance', 'support', 'read_only'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_workos_user_uq" ON "platform_admins" ("workos_user_id");
CREATE INDEX IF NOT EXISTS "platform_admins_active_idx" ON "platform_admins" ("disabled_at");
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" ("created_at");
CREATE INDEX IF NOT EXISTS "organizations_created_at_idx" ON "organizations" ("created_at");
CREATE INDEX IF NOT EXISTS "subscriptions_status_created_idx" ON "subscriptions" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "llm_calls_started_at_idx" ON "llm_calls" ("started_at");

CREATE TABLE IF NOT EXISTS "platform_admin_audit_events" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_platform_admin_id" text REFERENCES "platform_admins"("id") ON DELETE set null,
  "actor_workos_user_id" text NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "platform_admin_audit_time_idx" ON "platform_admin_audit_events" ("occurred_at");
CREATE INDEX IF NOT EXISTS "platform_admin_audit_actor_idx" ON "platform_admin_audit_events" ("actor_platform_admin_id");

CREATE TABLE IF NOT EXISTS "platform_cost_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "incurred_at" timestamptz NOT NULL,
  "service" text NOT NULL,
  "category" text NOT NULL,
  "environment" text NOT NULL DEFAULT 'production',
  "amount_usd" numeric(20,8) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "evidence_source" text NOT NULL,
  "external_reference" text,
  "imported_at" timestamptz,
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_cost_entries_evidence_ck" CHECK ("evidence_source" IN ('provider_measured', 'invoice_import', 'api_import', 'manual', 'estimated', 'unavailable'))
);
CREATE INDEX IF NOT EXISTS "platform_cost_entries_time_idx" ON "platform_cost_entries" ("incurred_at");
CREATE INDEX IF NOT EXISTS "platform_cost_entries_service_idx" ON "platform_cost_entries" ("service");

CREATE TABLE IF NOT EXISTS "platform_daily_metrics" (
  "day" timestamptz PRIMARY KEY NOT NULL,
  "registrations" integer NOT NULL DEFAULT 0,
  "organizations" integer NOT NULL DEFAULT 0,
  "active_users" integer NOT NULL DEFAULT 0,
  "runs" integer NOT NULL DEFAULT 0,
  "successful_runs" integer NOT NULL DEFAULT 0,
  "failed_runs" integer NOT NULL DEFAULT 0,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "known_ai_cost_usd" numeric(20,8),
  "unknown_cost_count" integer NOT NULL DEFAULT 0,
  "paying_subscriptions" integer NOT NULL DEFAULT 0,
  "known_platform_cost_usd" numeric(20,8),
  "computed_at" timestamptz NOT NULL DEFAULT now()
);
