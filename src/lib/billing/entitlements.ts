import type { Plan } from "@/db/schema";

export type EntitlementKey =
  | "saved_scenarios"
  | "prompt_comparisons"
  | "exports"
  | "personal_api_key"
  | "mcp_access"
  | "agent_observability"
  | "budgets_alerts"
  | "shared_projects"
  | "team_analytics"
  | "gateway"
  | "sso"
  | "scim"
  | "service_accounts"
  | "audit_logs"
  | "siem_export"
  | "advanced_retention";

export interface PlanEntitlements {
  plan: Plan;
  telemetryEventsPerMonth: number | null;
  projects: number | null;
  members: number | null;
  apiKeys: number | null;
  capabilities: Record<EntitlementKey, boolean>;
}

const baseCapabilities = (enabled: Partial<Record<EntitlementKey, boolean>>): Record<EntitlementKey, boolean> => ({
  saved_scenarios: false,
  prompt_comparisons: false,
  exports: false,
  personal_api_key: false,
  mcp_access: false,
  agent_observability: false,
  budgets_alerts: false,
  shared_projects: false,
  team_analytics: false,
  gateway: false,
  sso: false,
  scim: false,
  service_accounts: false,
  audit_logs: false,
  siem_export: false,
  advanced_retention: false,
  ...enabled,
});

export const PLAN_ENTITLEMENTS: Record<Plan, PlanEntitlements> = {
  free: {
    plan: "free",
    telemetryEventsPerMonth: 1_000,
    projects: 1,
    members: 1,
    apiKeys: 0,
    capabilities: baseCapabilities({ saved_scenarios: true }),
  },
  pro: {
    plan: "pro",
    telemetryEventsPerMonth: 100_000,
    projects: 10,
    members: 1,
    apiKeys: 3,
    capabilities: baseCapabilities({
      saved_scenarios: true,
      prompt_comparisons: true,
      exports: true,
      personal_api_key: true,
      mcp_access: true,
      agent_observability: true,
    }),
  },
  team: {
    plan: "team",
    telemetryEventsPerMonth: 2_000_000,
    projects: 100,
    members: null,
    apiKeys: 50,
    capabilities: baseCapabilities({
      saved_scenarios: true,
      prompt_comparisons: true,
      exports: true,
      personal_api_key: true,
      mcp_access: true,
      agent_observability: true,
      budgets_alerts: true,
      shared_projects: true,
      team_analytics: true,
      service_accounts: true,
      audit_logs: true,
    }),
  },
  enterprise: {
    plan: "enterprise",
    telemetryEventsPerMonth: null,
    projects: null,
    members: null,
    apiKeys: null,
    capabilities: baseCapabilities({
      saved_scenarios: true,
      prompt_comparisons: true,
      exports: true,
      personal_api_key: true,
      mcp_access: true,
      agent_observability: true,
      budgets_alerts: true,
      shared_projects: true,
      team_analytics: true,
      gateway: true,
      sso: true,
      scim: true,
      service_accounts: true,
      audit_logs: true,
      siem_export: true,
      advanced_retention: true,
    }),
  },
};

export function resolveEntitlements(
  plan: Plan,
  overrides: Partial<PlanEntitlements> & { capabilities?: Partial<Record<EntitlementKey, boolean>> } = {},
): PlanEntitlements {
  const base = PLAN_ENTITLEMENTS[plan];
  return {
    ...base,
    ...overrides,
    plan,
    capabilities: {
      ...base.capabilities,
      ...(overrides.capabilities ?? {}),
    },
  };
}

export function hasEntitlement(entitlements: PlanEntitlements, key: EntitlementKey): boolean {
  return entitlements.capabilities[key] === true;
}
