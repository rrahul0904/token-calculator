import { describe, expect, it } from "vitest";
import { consumePublicRateLimit } from "@/lib/http/public-rate-limit";

describe("public API rate limiting", () => {
  it("limits repeated anonymous requests without retaining a raw IP address", () => {
    const request = new Request("https://example.test/api/v1/economics/estimate", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const namespace = "test-" + Date.now();
    expect(consumePublicRateLimit(request, namespace, 2, 1_000).allowed).toBe(true);
    expect(consumePublicRateLimit(request, namespace, 2, 1_001).allowed).toBe(true);
    const blocked = consumePublicRateLimit(request, namespace, 2, 1_002);
    expect(blocked.allowed).toBe(false);
    expect(blocked.headers["Retry-After"]).toBeTruthy();
  });

  it("resets on the next fixed window", () => {
    const request = new Request("https://example.test/", { headers: { "x-real-ip": "198.51.100.7" } });
    const namespace = "reset-" + Date.now();
    expect(consumePublicRateLimit(request, namespace, 1, 5_000).allowed).toBe(true);
    expect(consumePublicRateLimit(request, namespace, 1, 5_001).allowed).toBe(false);
    expect(consumePublicRateLimit(request, namespace, 1, 65_001).allowed).toBe(true);
  });
});
