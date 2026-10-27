import { createHash, randomUUID } from "node:crypto";

/**
 * A non-inference acceptance slice for the future governed model gateway.
 * No provider is contacted and no synthetic response is marketed as model output.
 */
export const SIMULATED_MODEL_ID = "ti-simulated-open-model";
export const SIMULATION_SOURCE = "inference_simulation_v1";
export const MAX_SIMULATION_INPUT_BYTES = 16_384;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export type SimulationRequest = {
  model: typeof SIMULATED_MODEL_ID;
  input: string;
  stream: boolean;
};

export type SimulationReceipt = {
  id: string;
  status: "simulated";
  simulated: true;
  model: typeof SIMULATED_MODEL_ID;
  createdAt: string;
  inputBytes: number;
  inputTokenEstimate: number;
  outputTokensBilled: 0;
  providerInvoked: false;
  inputSha256: string;
};

export type ParseResult =
  | { ok: true; data: SimulationRequest }
  | { ok: false; code: string; message: string };

export function parseSimulationRequest(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "INVALID_REQUEST", message: "A JSON object is required." };
  }
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["model", "input", "stream", "store"].includes(key))) {
    return { ok: false, code: "UNSUPPORTED_FIELD", message: "Only model, input, stream and store are accepted in the simulation." };
  }
  if (data.model !== SIMULATED_MODEL_ID) {
    return { ok: false, code: "MODEL_NOT_AVAILABLE", message: "Only the explicitly simulated model is available." };
  }
  if (typeof data.input !== "string" || !data.input.trim()) {
    return { ok: false, code: "INVALID_INPUT", message: "A non-empty string input is required." };
  }
  const bytes = new TextEncoder().encode(data.input).byteLength;
  if (bytes > MAX_SIMULATION_INPUT_BYTES) {
    return { ok: false, code: "INPUT_TOO_LARGE", message: "Input must not exceed 16 KiB of UTF-8." };
  }
  if (data.stream !== undefined && typeof data.stream !== "boolean") {
    return { ok: false, code: "INVALID_STREAM", message: "stream must be boolean." };
  }
  if (data.store !== undefined && data.store !== false) {
    return { ok: false, code: "CONTENT_RETENTION_NOT_SUPPORTED", message: "Only store:false is supported." };
  }
  return { ok: true, data: { model: SIMULATED_MODEL_ID, input: data.input, stream: data.stream === true } };
}

export function parseIdempotencyKey(value: string | null): string | null {
  if (!value || value.length < 8 || value.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

export function requestDigest(request: SimulationRequest): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export function makeSimulationReceipt(request: SimulationRequest): SimulationReceipt {
  const encoded = new TextEncoder().encode(request.input);
  return {
    id: `sim_${randomUUID()}`,
    status: "simulated",
    simulated: true,
    model: SIMULATED_MODEL_ID,
    createdAt: new Date().toISOString(),
    inputBytes: encoded.byteLength,
    inputTokenEstimate: Math.ceil(encoded.byteLength / 4),
    outputTokensBilled: 0,
    providerInvoked: false,
    inputSha256: createHash("sha256").update(encoded).digest("hex"),
  };
}

export function simulationEvents(receipt: SimulationReceipt): string {
  const emit = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return emit("simulation.created", { id: receipt.id, simulated: true })
    + emit("simulation.completed", { receipt })
    + "data: [DONE]\n\n";
}

export function simulationResponse(receipt: SimulationReceipt, stream: boolean, replay: boolean): Response {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Inference-Simulated": "true",
    "X-Idempotent-Replay": String(replay),
  };
  if (stream) {
    return new Response(simulationEvents(receipt), {
      status: 200,
      headers: { ...headers, "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }
  return Response.json({ data: receipt }, { status: replay ? 200 : 201, headers });
}
