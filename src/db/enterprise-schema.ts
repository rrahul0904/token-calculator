import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "@/db/schema";
import { teams } from "@/db/gap-closure-schema";

export const workosDirectoryEvents = pgTable("workos_directory_events", {
  eventId: text("event_id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  directoryId: text("directory_id"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("workos_directory_events_org_idx").on(table.organizationId, table.processedAt)]);

export const workosDirectoryUsers = pgTable("workos_directory_users", {
  directoryUserId: text("directory_user_id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  directoryId: text("directory_id").notNull(),
  internalUserId: text("internal_user_id").references(() => users.id, { onDelete: "set null" }),
  email: text("email"),
  name: text("name"),
  state: text("state").notNull().default("active"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("workos_directory_users_org_idx").on(table.organizationId),
  index("workos_directory_users_directory_idx").on(table.directoryId),
]);

export const workosDirectoryGroups = pgTable("workos_directory_groups", {
  directoryGroupId: text("directory_group_id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  directoryId: text("directory_id").notNull(),
  teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  state: text("state").notNull().default("active"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("workos_directory_groups_org_idx").on(table.organizationId),
  index("workos_directory_groups_directory_idx").on(table.directoryId),
]);
