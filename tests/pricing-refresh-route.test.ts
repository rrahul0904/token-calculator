import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/internal/pricing/refresh/route";

const originalCron = process.env.CRON_SECRET;
const originalOpenRouter = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  if (originalCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCron;
  if (originalOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouter;
});

describe("optional pricing refresh cron", () => {
  it("returns a successful skipped result for an authorized scheduled GET when OpenRouter is intentionally not configured", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    delete process.env.OPENROUTER_API_KEY;
    const response = await GET(new Request("https://example.test/api/internal/pricing/refresh", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ skipped: true, reason: "OPENROUTER_API_KEY_NOT_CONFIGURED" });
  });

  it("fails loudly for an explicit manual POST when OpenRouter is not configured", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    delete process.env.OPENROUTER_API_KEY;
    const response = await POST(new Request("https://example.test/api/internal/pricing/refresh", {
      method: "POST",
      headers: { authorization: "Bearer cron-test-secret" },
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ skipped: false, reason: "OPENROUTER_API_KEY_NOT_CONFIGURED" });
  });
});
