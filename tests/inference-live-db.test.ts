import { randomUUID } from "node:crypto";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";
import { apiKeys, organizations, usageEvents } from "@/db/schema";
import { apiKeyQuotas } from "@/db/controls-schema";
import { generateApiKey } from "@/lib/security/api-keys";
import { LIVE_INFERENCE_SOURCE } from "@/lib/inference/live-provider";
import { POST } from "@/app/api/v1/inference/chat-completions/route";

const enabled = process.env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS === "1";
const model = "ti-live-test-qwen";
const organizationIds: string[] = [];
const calls: Array<{ model: string; input: string }> = [];
let server: http.Server;
let port: number;

type Identity = { organizationId: string; apiKeyId: string; secret: string };
async function identity(plan: "enterprise" | "free" = "enterprise", rpm = 10,
  monthlyTokens: number | null = 5000, monthlyCostUsd: string | null = null): Promise<Identity> {
  const suffix = randomUUID();
  const organizationId = "org_live_" + suffix;
  const apiKeyId = "key_live_" + suffix;
  const secret = generateApiKey("test");
  await getDb().insert(organizations).values({
    id: organizationId, name: "Live gateway test", slug: "live-gateway-" + suffix, plan,
  });
  organizationIds.push(organizationId);
  await getDb().insert(apiKeys).values({
    id: apiKeyId, organizationId, name: "Scoped live gateway test",
    environment: "test", prefix: secret.prefix, lastFour: secret.lastFour,
    secretHash: secret.hash, scopes: ["gateway:invoke"],
  });
  await getDb().insert(apiKeyQuotas).values({
    id: "quota_live_" + suffix, organizationId, apiKeyId, enabled: true,
    requestsPerMinute: rpm, monthlyTokenLimit: monthlyTokens, monthlyCostLimitUsd: monthlyCostUsd,
  });
  return { organizationId, apiKeyId, secret: secret.secret };
}

function request(secret: string, idem: string, text = "private-stable-prompt", maxTokens = 64): Request {
  return new Request("http://localhost/api/v1/inference/chat-completions", {
    method: "POST",
    headers: { authorization: "Bearer " + secret, "content-type": "application/json", "idempotency-key": idem },
    body: JSON.stringify({ model, messages: [{ role: "user", content: text }], max_tokens: maxTokens, store: false, stream: false }),
  });
}
async function post(secret: string, idem: string, text?: string, maxTokens?: number): Promise<Response> {
  return POST(request(secret, idem, text, maxTokens));
}

describe.skipIf(!enabled)("real inference gateway — disposable PostgreSQL and HTTP model server", () => {
  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
        res.writeHead(404); res.end(); return;
      }
      let raw = "";
      for await (const chunk of req) raw += chunk.toString("utf8");
      const parsed = JSON.parse(raw);
      const input = parsed.messages[0].content;
      calls.push({ model: parsed.model, input });
      if (input === "provider-error") {
        res.writeHead(503); res.end("private provider error body"); return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "model-fixture", choices: [{ message: { role: "assistant", content: "model reply " + calls.length },
          finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address !== "object") throw new Error("local_provider_port_unavailable");
    port = address.port;
    process.env.TI_INFERENCE_LIVE_ENABLED = "1";
    process.env.TI_INFERENCE_UPSTREAM_MODEL = model;
    process.env.TI_INFERENCE_UPSTREAM_BASE_URL = "http://127.0.0.1:" + port + "/v1";
    delete process.env.TI_INFERENCE_PRIVATE_REMOTE_APPROVED;
  });

  afterAll(async () => {
    try {
      for (const organizationId of organizationIds) {
        await getDb().delete(organizations).where(eq(organizations.id, organizationId));
      }
      await closeDb();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      delete process.env.TI_INFERENCE_LIVE_ENABLED;
      delete process.env.TI_INFERENCE_UPSTREAM_MODEL;
      delete process.env.TI_INFERENCE_UPSTREAM_BASE_URL;
    }
  });

  it("executes a real provider call only after scoped enterprise admission, with private prompt-free receipts", async () => {
    const enterprise = await identity();
    const beforeCalls = calls.length;
    const first = await post(enterprise.secret, "stable_live_000001");
    expect(first.status).toBe(200);
    const response = await first.json();
    expect(response.object).toBe("chat.completion");
    expect(response.model).toBe(model);
    expect(response.choices[0].message.content).toContain("model reply");
    expect(response.usage).toEqual({ prompt_tokens: 12, completion_tokens: 4 });
    expect(response.billing_state).toBe("not_billed");
    expect(first.headers.get("x-inference-upstream-invoked")).toBe("true");
    expect(calls).toHaveLength(beforeCalls + 1);

    const events = await getDb().select({ payload: usageEvents.payload, eventType: usageEvents.eventType })
      .from(usageEvents).where(and(eq(usageEvents.organizationId, enterprise.organizationId),
        eq(usageEvents.source, LIVE_INFERENCE_SOURCE)));
    expect(events.map((event) => event.eventType).sort()).toEqual(["inference.admitted", "inference.completed"]);
    const receiptData = JSON.stringify(events);
    expect(receiptData).not.toContain("private-stable-prompt");
    expect(receiptData).not.toContain("model reply");
    expect(receiptData).toContain("reservedTokens");
    expect(receiptData).toContain("reportedOutputTokens");

    const replay = await post(enterprise.secret, "stable_live_000001");
    expect(replay.status).toBe(409);
    expect((await replay.json()).error.code).toBe("REQUEST_ALREADY_ACCEPTED_RESPONSE_NOT_STORED");
    expect(calls).toHaveLength(beforeCalls + 1);
    const conflict = await post(enterprise.secret, "stable_live_000001", "changed prompt");
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    expect(calls).toHaveLength(beforeCalls + 1);
  });

  it("requires Enterprise plan and separate durable per-key request/token quotas", async () => {
    const free = await identity("free");
    const beforeCalls = calls.length;
    expect((await post(free.secret, "free_plan_live001")).status).toBe(403);

    const rpm = await identity("enterprise", 1);
    expect((await post(rpm.secret, "rpm_first_live_01")).status).toBe(200);
    const rejected = await post(rpm.secret, "rpm_second_live02");
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBe("60");

    const tiny = await identity("enterprise", 10, 1);
    const tokens = await post(tiny.secret, "monthly_tiny_live");
    expect(tokens.status).toBe(429);
    expect((await tokens.json()).error.code).toBe("MONTHLY_RESERVATION_CAP_EXCEEDED");

    const price = await identity("enterprise", 10, 5000, "1.00000000");
    const unpriced = await post(price.secret, "cost_unpriced_01");
    expect(unpriced.status).toBe(403);
    expect((await unpriced.json()).error.code).toBe("COST_QUOTA_REQUIRES_VERIFIED_PRICING");
    expect(calls.length).toBe(beforeCalls + 1);
  });

  it("records upstream failures as failed, never returns secret provider error, and forbids replay", async () => {
    const team = await identity();
    const result = await post(team.secret, "upstream_failure01", "provider-error");
    expect(result.status).toBe(502);
    const body = JSON.stringify(await result.json());
    expect(body).not.toContain("private provider error body");
    const rows = await getDb().select({ eventType: usageEvents.eventType, payload: usageEvents.payload })
      .from(usageEvents).where(and(eq(usageEvents.organizationId, team.organizationId),
        eq(usageEvents.source, LIVE_INFERENCE_SOURCE)));
    expect(rows.map((row) => row.eventType).sort()).toEqual(["inference.admitted", "inference.failed"]);
    expect(JSON.stringify(rows)).not.toContain("provider-error");
    expect((await post(team.secret, "upstream_failure01", "provider-error")).status).toBe(409);
  });

  it("serializes duplicate simultaneous requests before invoking provider twice", async () => {
    const team = await identity();
    const initial = calls.length;
    const [first, second] = await Promise.all([
      post(team.secret, "concurrent_live01", "unique private prompt"),
      post(team.secret, "concurrent_live01", "unique private prompt"),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(calls.length).toBe(initial + 1);
  });
});
