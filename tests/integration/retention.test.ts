import process from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { GET as runRetention } from "@/app/api/internal/retention/route";

const integrationEnabled = process.env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("retention cron", () => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: process.env.DATABASE_SSL === "disable" ? false : "require" });
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const org = `ret_org_${suffix}`;
  const oldRun = `ret_old_run_${suffix}`;
  const freshRun = `ret_fresh_run_${suffix}`;
  const oldEvent = `ret_old_event_${suffix}`;
  const freshEvent = `ret_fresh_event_${suffix}`;
  const oldAudit = `ret_old_audit_${suffix}`;
  const freshAudit = `ret_fresh_audit_${suffix}`;
  const oldFinding = `ret_old_finding_${suffix}`;
  const freshFinding = `ret_fresh_finding_${suffix}`;
  const otherOrg = `ret_other_org_${suffix}`;
  const otherRun = `ret_other_run_${suffix}`;
  const policy = `ret_policy_${suffix}`;
  const previousSecret = process.env.CRON_SECRET;

  beforeAll(async () => {
    process.env.CRON_SECRET = "integration-retention-secret";
    await sql`insert into organizations (id, name, slug) values (${org}, 'Retention Org', ${`retention-${suffix}`})`;
    await sql`insert into organizations (id, name, slug) values (${otherOrg}, 'Other Retention Org', ${`retention-other-${suffix}`})`;
    await sql`insert into retention_policies
      (id, organization_id, telemetry_days, run_days, finding_days, audit_days, enabled)
      values (${policy}, ${org}, 30, 30, 30, 30, true)`;
    await sql`insert into runs (id, organization_id, agent_name, started_at, status, metadata) values
      (${oldRun}, ${org}, 'retention-test', now() - interval '60 days', 'completed', '{}'::jsonb),
      (${freshRun}, ${org}, 'retention-test', now() - interval '1 day', 'completed', '{}'::jsonb)`;
    await sql`insert into runs (id, organization_id, agent_name, started_at, status, metadata) values
      (${otherRun}, ${otherOrg}, 'other-retention-test', now() - interval '60 days', 'completed', '{}'::jsonb)`;
    await sql`insert into findings
      (id, organization_id, run_id, rule_id, severity, title, evidence, confidence, recommendation, verification_recipe, created_at) values
      (${oldFinding}, ${org}, ${oldRun}, 'retention.old', 'low', 'Old finding', '{}'::jsonb, 'high', 'Delete when expired', 'Run retention', now() - interval '60 days'),
      (${freshFinding}, ${org}, ${freshRun}, 'retention.fresh', 'low', 'Fresh finding', '{}'::jsonb, 'high', 'Keep while retained', 'Run retention', now() - interval '1 day')`;
    await sql`insert into usage_events
      (id, organization_id, run_id, source_event_id, source, event_type, occurred_at, payload) values
      (${oldEvent}, ${org}, ${oldRun}, ${`ret-old-${suffix}`}, 'integration', 'retention.test', now() - interval '60 days', '{}'::jsonb),
      (${freshEvent}, ${org}, ${freshRun}, ${`ret-fresh-${suffix}`}, 'integration', 'retention.test', now() - interval '1 day', '{}'::jsonb)`;
    await sql`insert into audit_events
      (id, organization_id, actor_type, action, resource_type, occurred_at, details) values
      (${oldAudit}, ${org}, 'system', 'retention.old', 'test', now() - interval '60 days', '{}'::jsonb),
      (${freshAudit}, ${org}, 'system', 'retention.fresh', 'test', now() - interval '1 day', '{}'::jsonb)`;
  });

  afterAll(async () => {
    await closeDb();
    await sql`delete from organizations where id in (${org}, ${otherOrg})`;
    await sql.end({ timeout: 3 });
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  it("rejects an invalid cron secret", async () => {
    const response = await runRetention(new Request("http://test.local/api/internal/retention", {
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(401);
  });

  it("reports a configuration error when CRON_SECRET is absent", async () => {
    delete process.env.CRON_SECRET;
    const response = await runRetention(new Request("http://test.local/api/internal/retention"));
    process.env.CRON_SECRET = "integration-retention-secret";
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "RETENTION_CRON_NOT_CONFIGURED" });
  });

  it("deletes expired records while preserving fresh tenant data", async () => {
    const response = await runRetention(new Request("http://test.local/api/internal/retention", {
      headers: { authorization: "Bearer integration-retention-secret" },
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    const result = body.data.results.find((item: { organizationId: string }) => item.organizationId === org);
    expect(result).toBeTruthy();
    expect(result.deleted.telemetry).toBeGreaterThanOrEqual(1);
    expect(result.deleted.findings).toBeGreaterThanOrEqual(1);
    expect(result.deleted.runs).toBeGreaterThanOrEqual(1);
    expect(result.deleted.auditEvents).toBeGreaterThanOrEqual(1);

    const rows = await sql<{ id: string }[]>`
      select id from (
        select id from runs where organization_id = ${org}
        union all select id from usage_events where organization_id = ${org}
        union all select id from findings where organization_id = ${org}
        union all select id from audit_events where organization_id = ${org}
      ) retained
    `;
    const ids = new Set(rows.map((row) => row.id));
    expect(ids.has(oldRun)).toBe(false);
    expect(ids.has(oldEvent)).toBe(false);
    expect(ids.has(oldAudit)).toBe(false);
    expect(ids.has(oldFinding)).toBe(false);
    expect(ids.has(freshRun)).toBe(true);
    expect(ids.has(freshEvent)).toBe(true);
    expect(ids.has(freshAudit)).toBe(true);
    expect(ids.has(freshFinding)).toBe(true);

    const otherTenant = await sql<{ id: string }[]>`select id from runs where organization_id = ${otherOrg}`;
    expect(otherTenant.map((row) => row.id)).toContain(otherRun);
  });
});
