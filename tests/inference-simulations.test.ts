import { describe, expect, it } from "vitest";
import {
  MAX_SIMULATION_INPUT_BYTES,
  SIMULATED_MODEL_ID,
  makeSimulationReceipt,
  parseIdempotencyKey,
  parseSimulationRequest,
  requestDigest,
  simulationEvents,
  simulationResponse,
} from "@/lib/inference/simulation";

const request = { model: SIMULATED_MODEL_ID, input: "Show the bug", stream: false } as const;

describe("inference simulation: explicit non-production contract", () => {
  it("only accepts the simulated model and an input string", () => {
    expect(parseSimulationRequest(request)).toEqual({ ok: true, data: request });
    expect(parseSimulationRequest({ model: "qwen-3.8-27b", input: "secret" })).toMatchObject({
      ok: false, code: "MODEL_NOT_AVAILABLE",
    });
    expect(parseSimulationRequest({ model: SIMULATED_MODEL_ID, input: [] })).toMatchObject({
      ok: false, code: "INVALID_INPUT",
    });
    expect(parseSimulationRequest(null)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });

  it("rejects unsupported fields, hosted tools and retention", () => {
    expect(parseSimulationRequest({ ...request, tools: [{ type: "web_search" }] })).toMatchObject({
      ok: false, code: "UNSUPPORTED_FIELD",
    });
    expect(parseSimulationRequest({ ...request, store: true })).toMatchObject({
      ok: false, code: "CONTENT_RETENTION_NOT_SUPPORTED",
    });
    expect(parseSimulationRequest({ ...request, temperature: 0.1 })).toMatchObject({
      ok: false, code: "UNSUPPORTED_FIELD",
    });
    expect(parseSimulationRequest({ ...request, stream: "true" })).toMatchObject({
      ok: false, code: "INVALID_STREAM",
    });
    expect(parseSimulationRequest({ ...request, store: false })).toMatchObject({
      ok: true, data: request,
    });
  });

  it("bounds UTF-8 bytes, not JavaScript string length", () => {
    expect(parseSimulationRequest({ ...request, input: "é".repeat(MAX_SIMULATION_INPUT_BYTES / 2) }).ok).toBe(true);
    expect(parseSimulationRequest({ ...request, input: "é".repeat(MAX_SIMULATION_INPUT_BYTES / 2 + 1) })).toMatchObject({
      ok: false, code: "INPUT_TOO_LARGE",
    });
    expect(parseSimulationRequest({ ...request, input: "   " })).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("does not accept malformed, header-injected or weak idempotency keys", () => {
    expect(parseIdempotencyKey("request_0123456789")).toBe("request_0123456789");
    expect(parseIdempotencyKey("bad")).toBeNull();
    expect(parseIdempotencyKey("12345678\r\nInjected: yes")).toBeNull();
    expect(parseIdempotencyKey("A".repeat(129))).toBeNull();
    expect(parseIdempotencyKey(null)).toBeNull();
  });

  it("stable request digests bind the stream and input, not the idempotency key", () => {
    expect(requestDigest(request)).toBe(requestDigest({ ...request }));
    expect(requestDigest(request)).not.toBe(requestDigest({ ...request, input: "changed" }));
    expect(requestDigest(request)).not.toBe(requestDigest({ ...request, stream: true }));
  });

  it("creates a receipt but performs no model inference or billable output", () => {
    const receipt = makeSimulationReceipt(request);
    expect(receipt.id).toMatch(/^sim_/);
    expect(receipt.status).toBe("simulated");
    expect(receipt.simulated).toBe(true);
    expect(receipt.providerInvoked).toBe(false);
    expect(receipt.outputTokensBilled).toBe(0);
    expect(receipt.inputTokenEstimate).toBe(3);
    expect(receipt.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(receipt)).not.toContain(request.input);
  });

  it("returns an explicitly labeled non-streaming response and replay marker", async () => {
    const receipt = makeSimulationReceipt(request);
    const fresh = simulationResponse(receipt, false, false);
    expect(fresh.status).toBe(201);
    expect(fresh.headers.get("cache-control")).toBe("no-store");
    expect(fresh.headers.get("x-inference-simulated")).toBe("true");
    expect((await fresh.json()).data.id).toBe(receipt.id);
    const replay = simulationResponse(receipt, false, true);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-idempotent-replay")).toBe("true");
  });

  it("emits bounded deterministic SSE with no invented generated token deltas", async () => {
    const receipt = makeSimulationReceipt(request);
    const response = simulationResponse(receipt, true, false);
    const body = await response.text();
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(body).toBe(simulationEvents(receipt));
    expect(body).toContain("event: simulation.created");
    expect(body).toContain("event: simulation.completed");
    expect(body).toContain("data: [DONE]");
    expect(body).not.toContain("response.output_text.delta");
  });
});
