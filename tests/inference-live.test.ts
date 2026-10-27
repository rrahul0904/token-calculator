import { describe, expect, it } from "vitest";
import {
  callLiveProvider, estimateReservedTokens, liveRequestDigest, parseLiveRequest, parseUpstreamConfig,
  type LiveRequest,
} from "@/lib/inference/live-provider";

const req: LiveRequest = {
  model: "qwen-example",
  messages: [{ role: "user", content: "Explain a pure function." }],
  max_tokens: 64,
};
const localEnv = {
  TI_INFERENCE_UPSTREAM_BASE_URL: "http://127.0.0.1:8000/v1",
  TI_INFERENCE_UPSTREAM_MODEL: "qwen-example",
} as NodeJS.ProcessEnv;

describe("live inference protocol and egress policy", () => {
  it("accepts one fixed model and bounded chat messages but no store or streaming", () => {
    expect(parseLiveRequest({ ...req, store: false, stream: false }, req.model)).toEqual({ ok: true, data: req });
    expect(parseLiveRequest({ ...req, store: true }, req.model)).toMatchObject({ ok: false });
    expect(parseLiveRequest({ ...req, stream: true, store: false }, req.model)).toMatchObject({ ok: false });
    expect(parseLiveRequest({ ...req, tools: [], store: false }, req.model)).toMatchObject({ ok: false, code: "UNSUPPORTED_FIELD" });
    expect(parseLiveRequest({ ...req, model: "other", store: false }, req.model)).toMatchObject({ ok: false, code: "MODEL_NOT_APPROVED" });
    expect(parseLiveRequest({ ...req, max_tokens: 9000, store: false }, req.model)).toMatchObject({ ok: false, code: "MAX_TOKENS_INVALID" });
    expect(parseLiveRequest({ ...req, messages: [{ role: "tool", content: "run" }], store: false }, req.model)).toMatchObject({ ok: false });
    expect(parseLiveRequest({ ...req, messages: [{ role: "user", content: "a".repeat(17000) }], store: false }, req.model)).toMatchObject({ ok: false, code: "INPUT_TOO_LARGE" });
  });

  it("canonical request digest does not reveal prompt and monthly reservations include max output", () => {
    const digest = liveRequestDigest(req);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain("Explain");
    expect(liveRequestDigest({ ...req, messages: [{ role: "user", content: "different" }] })).not.toBe(digest);
    const estimate = estimateReservedTokens(req);
    expect(estimate.reserve).toBe(estimate.inputEstimate + req.max_tokens);
    expect(estimate.inputEstimate).toBeGreaterThan(0);
  });

  it("only permits local /v1 or exact approved remote HTTPS with separate privacy opt-in", () => {
    const local = parseUpstreamConfig(localEnv);
    expect(local.endpoint).toBe("http://127.0.0.1:8000/v1/chat/completions");
    expect(local.lane).toBe("local");
    const remote = { ...localEnv, TI_INFERENCE_UPSTREAM_BASE_URL: "https://models.example/v1",
      TI_INFERENCE_UPSTREAM_ALLOWED_ORIGIN: "https://models.example" };
    expect(() => parseUpstreamConfig(remote)).toThrow("INFERENCE_PRIVATE_REMOTE_NOT_APPROVED");
    expect(parseUpstreamConfig({ ...remote, TI_INFERENCE_PRIVATE_REMOTE_APPROVED: "1" }).lane).toBe("approved_remote");
    expect(() => parseUpstreamConfig({ ...remote, TI_INFERENCE_UPSTREAM_BASE_URL: "https://models.example.attacker/v1", TI_INFERENCE_PRIVATE_REMOTE_APPROVED: "1" })).toThrow("INFERENCE_UPSTREAM_ORIGIN_NOT_APPROVED");
    expect(() => parseUpstreamConfig({ ...localEnv, TI_INFERENCE_UPSTREAM_BASE_URL: "file:///etc/passwd/v1" })).toThrow();
    expect(() => parseUpstreamConfig({ ...localEnv, TI_INFERENCE_UPSTREAM_BASE_URL: "https://user:password@models.example/v1" })).toThrow("INFERENCE_UPSTREAM_URL_UNSAFE");
    expect(() => parseUpstreamConfig({ ...localEnv, TI_INFERENCE_UPSTREAM_BASE_URL: "http://127.0.0.1.evil.com/v1" })).toThrow("INFERENCE_UPSTREAM_ORIGIN_NOT_APPROVED");
  });

  it("uses actual OpenAI-compatible HTTP POST and strips provider-only fields", async () => {
    let called = 0;
    const provider = async (_url: string | URL | Request, init?: RequestInit) => {
      called++;
      expect(init?.redirect).toBe("manual");
      expect(JSON.parse(String(init?.body))).toEqual({ ...req, store: false, stream: false });
      return Response.json({
        id: "chatcmpl-fixture", choices: [{ message: { role: "assistant", content: "A pure function is deterministic.", reasoning: "private" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 7 }, secret: "never-return-this",
      });
    };
    const answer = await callLiveProvider(parseUpstreamConfig(localEnv), req, provider as typeof fetch);
    expect(answer.output).toBe("A pure function is deterministic.");
    expect(answer.usage).toEqual({ prompt_tokens: 12, completion_tokens: 7 });
    expect(JSON.stringify(answer)).not.toContain("private");
    expect(JSON.stringify(answer)).not.toContain("never-return-this");
    expect(called).toBe(1);
  });

  it("refuses redirects, tool calls, partial output, transport errors and oversized responses", async () => {
    const variants = [
      new Response("redirect", { status: 302, headers: { location: "https://evil.example/" } }),
      Response.json({ choices: [{ message: { content: "", tool_calls: [{ function: { name: "shell" } }] }, finish_reason: "tool_calls" }] }),
      Response.json({ choices: [{ message: { content: "partial" }, finish_reason: "length" }] }),
      new Response("x".repeat(130_000), { status: 200, headers: { "content-type": "application/json" } }),
    ];
    for (const response of variants) {
      await expect(callLiveProvider(parseUpstreamConfig(localEnv), req, (async () => response) as typeof fetch)).rejects.toThrow("PROVIDER_");
    }
    await expect(callLiveProvider(parseUpstreamConfig(localEnv), req, (async () => { throw new Error("Bearer secret"); }) as typeof fetch)).rejects.toThrow("PROVIDER_TRANSPORT_ERROR");
  });
});
