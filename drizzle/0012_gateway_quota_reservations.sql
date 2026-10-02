ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "idempotency_scope_id" text NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_idempotency_scope_uq"
  ON "api_keys" ("idempotency_scope_id");

CREATE TABLE IF NOT EXISTS "gateway_quota_reservations" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "api_key_id" text NOT NULL REFERENCES "api_keys"("id") ON DELETE CASCADE,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "reserved_tokens" numeric(24,6) NOT NULL,
  "reserved_cost_usd" numeric(24,8),
  "status" text DEFAULT 'reserved' NOT NULL CHECK ("status" IN ('reserved', 'unknown', 'released')),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "gateway_quota_reservations_key_period_status_idx"
  ON "gateway_quota_reservations" ("organization_id", "api_key_id", "period_start", "status");

DROP TRIGGER IF EXISTS ti_gateway_quota_reservations_tenant ON gateway_quota_reservations;
CREATE TRIGGER ti_gateway_quota_reservations_tenant
BEFORE INSERT OR UPDATE OF api_key_id, organization_id ON gateway_quota_reservations
FOR EACH ROW EXECUTE FUNCTION token_intelligence_assert_same_tenant('api_keys', 'api_key_id');
