import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: true,
  authenticate: vi.fn(async () => null as unknown),
}));

vi.mock("@/db/client", () => ({
  isDatabaseConfigured: () => mocks.configured,
  getDb: vi.fn(),
}));
vi.mock("@/lib/auth/api-auth", () => ({
  authenticateApiKey: mocks.authenticate,
}));

import { POST } from "@/app/api/v1/inference-simulations/route";
import { GET } from "@/app/api/v1/inference-simulations/models/route";

function request(url: string, method = "POST") {
  return new Request(url, {
    method,
    headers: {
      "Authorization": "Bearer invalid",
      "Idempotency-Key": "request_01234567",
      "Content-Type": "application/json",
    },
    ...(method === "POST" ? { body: JSON.stringify({ model: "ti-simulated-open-model", input: "private" }) } : {}),
  });
}

describe("inference simulation HTTP access controls", () => {
  beforeEach(() => {
    vi.stubEnv("INFERENCE_SIMULATION_ENABLED", "1");
    mocks.configured = true;
    mocks.authenticate.mockReset();
    mocks.authenticate.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is unreachable by default, even when an API key is supplied", async () => {
    vi.stubEnv("INFERENCE_SIMULATION_ENABLED", "");
    const response = await POST(request("http://localhost/api/v1/inference-simulations"));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("SIMULATION_DISABLED");
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("refuses to operate without durable storage", async () => {
    mocks.configured = false;
    const response = await POST(request("http://localhost/api/v1/inference-simulations"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("DATABASE_NOT_CONFIGURED");
  });

  it("rejects requests missing a scoped API key before processing prompts", async () => {
    const response = await POST(request("http://localhost/api/v1/inference-simulations"));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("API_KEY_REQUIRED");
    expect(mocks.authenticate).toHaveBeenCalledWith(expect.any(Request), "gateway:invoke");
  });

  it("does not list simulated models to anonymous callers", async () => {
    const response = await GET(request("http://localhost/api/v1/inference-simulations/models", "GET"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("API_KEY_REQUIRED");
  });

  it("never exposes models when the simulator flag is off", async () => {
    vi.stubEnv("INFERENCE_SIMULATION_ENABLED", "");
    const response = await GET(request("http://localhost/api/v1/inference-simulations/models", "GET"));
    expect(response.status).toBe(404);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
});
