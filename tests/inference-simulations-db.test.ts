import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";
import { apiKeys, organizations, usageEvents } from "@/db/schema";
import { apiKeyQuotas } from "@/db/controls-schema";
import { generateApiKey } from "@/lib/security/api-keys";
import { POST } from "@/app/api/v1/inference-simulations/route";
import { GET } from "@/app/api/v1/inference-simulations/models/route";
import { SIMULATION_SOURCE, SIMULATED_MODEL_ID } from "@/lib/inference/simulation";

const enabled = process.env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS === "1";

type Fixture = { organizationId: string; apiKeyId: string; secret: string };
const organizationsToRemove: string[] = [];

async function identity(plan: "enterprise" | "free", rpm: number, monthTokens: number | null = null, scopes = ["gateway:invoke"]): Promise<Fixture> {
  const suffix = randomUUID();
  const organizationId = `org_sim_${suffix}`;
  const apiKeyId = `key_sim_${suffix}`;
  const material = generateApiKey("test");
  const db = getDb();
  await db.insert(organizations).values({
    id: organizationId,
    name: "Integration Simulator",
    slug: `inference-sim-${suffix}`,
    plan,
  });
  organizationsToRemove.push(organizationId);
  await db.insert(apiKeys).values({
    id: apiKeyId,
    organizationId,
    name: "Gateway scoped key",
    environment: "test",
    prefix: material.prefix,
    lastFour: material.lastFour,
    secretHash: material.hash,
    scopes,
  });
  await db.insert(apiKeyQuotas).values({
    id: `quota_${suffix}`,
    organizationId,
    apiKeyId,
    requestsPerMinute: rpm,
    monthlyTokenLimit: monthTokens,
  });
  return { organizationId, apiKeyId, secret: material.secret };
}

function post(secret: string, idem: string, input = "never persist this raw prompt", stream = false): Promise<Response> {
  return POST(new Request("http://localhost/api/v1/inference-simulations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "idempotency-key": idem,
    },
    body: JSON.stringify({ model: SIMULATED_MODEL_ID, input, stream, store: false }),
  }));
}

describe.skipIf(!enabled)("inference simulator — disposable PostgreSQL end-to-end", () => {
  beforeAll(() => {
    process.env.INFERENCE_SIMULATION_ENABLED = "1";
  });

  afterAll(async () => {
    const db = getDb();
    for (const organizationId of organizationsToRemove) {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }
    await closeDb();
    delete process.env.INFERENCE_SIMULATION_ENABLED;
  });

  it("authorizes model discovery for a valid enterprise scoped key only", async () => {
    const team = await identity("enterprise", 20);
    const response = await GET(new Request("http://localhost/api/v1/inference-simulations/models", {
      headers: { authorization: `Bearer ${team.secret}` },
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data[0].id).toBe(SIMULATED_MODEL_ID);
    expect(payload.data[0].simulated).toBe(true);
    const free = await identity("free", 20);
    expect((await post(free.secret, "free_deny_001")).status).toBe(403);
    const noScope = await identity("enterprise", 20, null, ["read:models"]);
    expect((await post(noScope.secret, "scope_deny_001")).status).toBe(401);
  });

  it("persists one prompt-free receipt, replays idempotently and rejects conflicting reuse", async () => {
    const team = await identity("enterprise", 20);
    const first = await post(team.secret, "stable_request_00001");
    expect(first.status).toBe(201);
    const original = (await first.json()).data;
    expect(original.simulated).toBe(true);
    expect(original.providerInvoked).toBe(false);
    const replay = await post(team.secret, "stable_request_00001");
    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-idempotent-replay")).toBe("true");
    expect((await replay.json()).data.id).toBe(original.id);
    const changed = await post(team.secret, "stable_request_00001", "different prompt");
    expect(changed.status).toBe(409);
    const events = await getDb().select({ payload: usageEvents.payload }).from(usageEvents).where(and(
      eq(usageEvents.organizationId, team.organizationId),
      eq(usageEvents.source, SIMULATION_SOURCE),
    ));
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0].payload)).not.toContain("never persist this raw prompt");
  });

  it("enforces RPM under PostgreSQL while allowing an exact replay", async () => {
    const team = await identity("enterprise", 1);
    expect((await post(team.secret, "rpm_first_00001")).status).toBe(201);
    const rejection = await post(team.secret, "rpm_second_00002");
    expect(rejection.status).toBe(429);
    expect(rejection.headers.get("retry-after")).toBe("60");
    expect((await post(team.secret, "rpm_first_00001")).status).toBe(200);
  });

  it("rejects an estimated monthly-token cap before recording an event", async () => {
    const team = await identity("enterprise", 20, 1);
    const result = await post(team.secret, "monthly_quota_00001", "this is more than one token");
    expect(result.status).toBe(429);
    expect((await result.json()).error.code).toBe("ESTIMATED_MONTHLY_TOKEN_CAP_EXCEEDED");
    const recorded = await getDb().select({ id: usageEvents.id }).from(usageEvents).where(eq(usageEvents.organizationId, team.organizationId));
    expect(recorded).toHaveLength(0);
  });

  it("streams only labeled simulation events, with no fabricated text delta", async () => {
    const team = await identity("enterprise", 20);
    const response = await post(team.secret, "stream_request_00001", "private streaming prompt", true);
    expect(response.status).toBe(200);
    const events = await response.text();
    expect(events).toContain("event: simulation.completed");
    expect(events).not.toContain("private streaming prompt");
    expect(events).not.toContain("response.output_text.delta");
  });
});
