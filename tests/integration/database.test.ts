import process from "node:process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { checkApiKeyQuota } from "@/lib/gateway/quota";
import { consumeGatewayRateLimit } from "@/lib/gateway/rate-limit";

const integrationEnabled = process.env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

function expectPgCode(error: unknown, code: string) {
  expect(error).toBeTruthy();
  expect(typeof error).toBe("object");
  expect((error as { code?: string }).code).toBe(code);
}

describeIntegration("database release invariants", () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const orgA = `it_org_a_${suffix}`;
  const orgB = `it_org_b_${suffix}`;
  const projectA = `it_project_a_${suffix}`;
  const projectB = `it_project_b_${suffix}`;
  const serviceA = `it_service_a_${suffix}`;
  const keyA = `it_key_a_${suffix}`;
  const runA = `it_run_a_${suffix}`;
  const runB = `it_run_b_${suffix}`;
  const turnA = `it_turn_a_${suffix}`;

  beforeAll(async () => {
    expect(databaseUrl).toBeTruthy();
    await sql`insert into organizations (id, name, slug) values
      (${orgA}, 'Integration Org A', ${`integration-org-a-${suffix}`}),
      (${orgB}, 'Integration Org B', ${`integration-org-b-${suffix}`})`;
    await sql`insert into projects (id, organization_id, name, slug) values
      (${projectA}, ${orgA}, 'Project A', 'project-a'),
      (${projectB}, ${orgB}, 'Project B', 'project-b')`;
    await sql`insert into service_accounts (id, organization_id, name) values (${serviceA}, ${orgA}, 'Service A')`;
    await sql`insert into api_keys
      (id, organization_id, service_account_id, project_id, name, environment, prefix, last_four, secret_hash, scopes)
      values (${keyA}, ${orgA}, ${serviceA}, ${projectA}, 'Integration key', 'test', ${`ti_it_${suffix}`}, '1234', 'integration-hash', '["gateway:invoke"]'::jsonb)`;
    await sql`insert into api_key_quotas (id, organization_id, api_key_id, requests_per_minute)
      values (${`quota_${suffix}`}, ${orgA}, ${keyA}, 120)`;
    await sql`insert into runs
      (id, organization_id, project_id, agent_name, started_at, status, metadata)
      values
      (${runA}, ${orgA}, ${projectA}, 'integration-agent', now(), 'running', ${sql.json({ apiKeyId: keyA })}),
      (${runB}, ${orgB}, ${projectB}, 'integration-agent', now(), 'running', '{}'::jsonb)`;
    await sql`insert into turns
      (id, organization_id, run_id, turn_index, started_at, status)
      values (${turnA}, ${orgA}, ${runA}, 0, now(), 'running')`;
  });

  afterAll(async () => {
    await closeDb();
    await sql`delete from organizations where id in (${orgA}, ${orgB})`;
    await sql.end({ timeout: 3 });
  });

  it("rejects cross-tenant project references", async () => {
    try {
      await sql`insert into saved_scenarios
        (id, organization_id, project_id, name, scenario)
        values (${`scenario_cross_${suffix}`}, ${orgA}, ${projectB}, 'Cross tenant', '{}'::jsonb)`;
      throw new Error("expected tenant guard rejection");
    } catch (error) {
      expectPgCode(error, "23514");
    }
  });

  it("rejects cross-tenant run and turn lineage", async () => {
    try {
      await sql`insert into turns
        (id, organization_id, run_id, turn_index, started_at, status)
        values (${`turn_cross_${suffix}`}, ${orgA}, ${runB}, 1, now(), 'running')`;
      throw new Error("expected tenant guard rejection");
    } catch (error) {
      expectPgCode(error, "23514");
    }
  });

  it("rejects cross-tenant API-key quota ownership", async () => {
    try {
      await sql`insert into api_key_quotas
        (id, organization_id, api_key_id, requests_per_minute)
        values (${`quota_cross_${suffix}`}, ${orgB}, ${keyA}, 60)`;
      throw new Error("expected tenant guard rejection");
    } catch (error) {
      expectPgCode(error, "23514");
    }
  });

  it("rejects cross-tenant service-account key ownership", async () => {
    try {
      await sql`insert into api_keys
        (id, organization_id, service_account_id, name, environment, prefix, last_four, secret_hash, scopes)
        values (${`key_cross_service_${suffix}`}, ${orgB}, ${serviceA}, 'Cross service key', 'test', ${`ti_cross_${suffix}`}, '9876', 'integration-hash-2', '[]'::jsonb)`;
      throw new Error("expected tenant guard rejection");
    } catch (error) {
      expectPgCode(error, "23514");
    }
  });

  it("meters measured gateway tokens and cost at the persistence boundary", async () => {
    await sql`insert into llm_calls
      (id, organization_id, run_id, turn_id, provider, model_requested, model_resolved,
       fresh_input_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, output_tokens,
       cost_usd, cost_source, started_at)
      values (${`llm_meter_${suffix}`}, ${orgA}, ${runA}, ${turnA}, 'openai', 'gpt-test', 'gpt-test',
        100, 20, 5, 10, 30, 0.01234567, 'provider_measured', now())`;

    const rows = await sql<{ metric: string; value: string }[]>`
      select metric, value::text as value from usage_counters
      where organization_id = ${orgA} and scope_type = 'api_key' and scope_id = ${keyA}
        and metric in ('gateway_tokens', 'gateway_cost_usd')
    `;
    const values = new Map(rows.map((row) => [row.metric, Number(row.value)]));
    expect(values.get("gateway_tokens")).toBe(165);
    expect(values.get("gateway_cost_usd")).toBe(0.012346);
  });

  it("fails closed when the monthly token quota is exhausted", async () => {
    await sql`update api_key_quotas set monthly_token_limit = 100 where organization_id = ${orgA} and api_key_id = ${keyA}`;
    const quota = await checkApiKeyQuota(orgA, keyA);
    expect(quota.allowed).toBe(false);
    expect(quota.reason).toBe("MONTHLY_TOKEN_QUOTA_EXCEEDED");
    expect(quota.state.usedTokens).toBeGreaterThanOrEqual(165);
    await sql`update api_key_quotas set monthly_token_limit = null where organization_id = ${orgA} and api_key_id = ${keyA}`;
  });

  it("enforces the request-per-minute limit through shared PostgreSQL state", async () => {
    const first = await consumeGatewayRateLimit(orgA, keyA, 2);
    const second = await consumeGatewayRateLimit(orgA, keyA, 2);
    const third = await consumeGatewayRateLimit(orgA, keyA, 2);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("enforces telemetry event idempotency per organization/source/event id", async () => {
    const eventId = `event_${suffix}`;
    const sourceEventId = `source_${suffix}`;
    await sql`insert into usage_events
      (id, organization_id, project_id, run_id, source_event_id, source, event_type, occurred_at, payload)
      values (${eventId}, ${orgA}, ${projectA}, ${runA}, ${sourceEventId}, 'integration', 'run.test', now(), '{}'::jsonb)`;
    try {
      await sql`insert into usage_events
        (id, organization_id, project_id, run_id, source_event_id, source, event_type, occurred_at, payload)
        values (${`${eventId}_duplicate`}, ${orgA}, ${projectA}, ${runA}, ${sourceEventId}, 'integration', 'run.test', now(), '{}'::jsonb)`;
      throw new Error("expected duplicate event rejection");
    } catch (error) {
      expectPgCode(error, "23505");
    }
  });
});
