CREATE TABLE IF NOT EXISTS "workos_directory_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "event_type" text NOT NULL,
  "directory_id" text,
  "processed_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "workos_directory_events_org_idx" ON "workos_directory_events" ("organization_id", "processed_at");

CREATE TABLE IF NOT EXISTS "workos_directory_users" (
  "directory_user_id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "directory_id" text NOT NULL,
  "internal_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "email" text,
  "name" text,
  "state" text DEFAULT 'active' NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "workos_directory_users_org_idx" ON "workos_directory_users" ("organization_id");
CREATE INDEX IF NOT EXISTS "workos_directory_users_directory_idx" ON "workos_directory_users" ("directory_id");

CREATE TABLE IF NOT EXISTS "workos_directory_groups" (
  "directory_group_id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "directory_id" text NOT NULL,
  "team_id" text REFERENCES "teams"("id") ON DELETE set null,
  "name" text NOT NULL,
  "state" text DEFAULT 'active' NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "workos_directory_groups_org_idx" ON "workos_directory_groups" ("organization_id");
CREATE INDEX IF NOT EXISTS "workos_directory_groups_directory_idx" ON "workos_directory_groups" ("directory_id");
