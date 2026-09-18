import process from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { evaluateOrganizationPolicy } from "@/lib/policy/evaluate-db";

const integrationEnabled = process.env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("action-risk approval persistence", () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const organizationId = `risk_org_${suffix}`;
  const runId = `risk_run_${suffix}`;
  const policyId = `risk_policy_${suffix}`;

  beforeAll(async () => {
    await sql`insert into organizations (id, name, slug)
      values (${organizationId}, 'Risk Integration Org', ${`risk-integration-${suffix}`})`;
    await sql`insert into runs (id, organization_id, agent_name, started_at, status, metadata)
      values (${runId}, ${organizationId}, 'risk-test-agent', now(), 'running', '{}'::jsonb)`;
    await sql`insert into policies (id, organization_id, name, scope_type, priority, enabled, rules)
      values (
        ${policyId},
        ${organizationId},
        'Action risk policy',
        'organization',
        100,
        true,
        ${sql.json({ maxAutonomousActionRisk: "medium", approvalActionCategories: ["database"] })}
      )`;
  });

  afterAll(async () => {
    await closeDb();
    await sql`delete from organizations where id = ${organizationId}`;
    await sql.end({ timeout: 3 });
  });

  it("creates one expiring approval and reuses it for repeated checks on the same run", async () => {
    const first = await evaluateOrganizationPolicy(organizationId, {
      runId,
      actionRisk: "high",
      actionCategory: "database",
      actionName: "Apply production migration",
    });
    expect(first.decision.action).toBe("REQUIRE_APPROVAL");
    expect(first.enforcement).toBe("await_approval");
    expect(first.approvalId).toMatch(/^apr_/);

    const second = await evaluateOrganizationPolicy(organizationId, {
      runId,
      actionRisk: "high",
      actionCategory: "database",
      actionName: "Apply production migration",
    });
    expect(second.approvalId).toBe(first.approvalId);

    const approvals = await sql<Array<{
      id: string;
      status: string;
      requested_by: string | null;
      expires_at: Date | null;
      reason: string | null;
    }>>`
      select id, status, requested_by, expires_at, reason
      from approvals
      where organization_id = ${organizationId} and run_id = ${runId}
    `;
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      id: first.approvalId,
      status: "pending",
      requested_by: "policy_engine",
    });
    expect(approvals[0].expires_at?.getTime()).toBeGreaterThan(Date.now());
    expect(approvals[0].reason).toContain("requires human approval");

    const decisions = await sql<Array<{ decision_data: Record<string, unknown> }>>`
      select decision_data
      from budget_decisions
      where organization_id = ${organizationId} and run_id = ${runId}
      order by decided_at asc
    `;
    expect(decisions).toHaveLength(2);
    expect(decisions[0]?.decision_data).toMatchObject({
      actionRisk: "high",
      actionCategory: "database",
      actionName: "Apply production migration",
    });
  });
});
