CREATE TABLE IF NOT EXISTS "organization_data_controls" (
  "organization_id" text PRIMARY KEY NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "privacy_mode" text DEFAULT 'metadata_only' NOT NULL,
  "requested_data_region" text,
  "configured_data_region" text,
  "updated_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "organization_data_controls_privacy_mode_ck" CHECK ("privacy_mode" IN ('metadata_only', 'redacted_content', 'full_content', 'customer_managed_storage'))
);
