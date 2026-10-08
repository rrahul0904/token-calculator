import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  discoverAntigravityPort,
  discoverAntigravityPortFromText,
  fetchAntigravityQuotaSnapshot,
  normalizeAntigravityPayloads,
} from "@/lib/quota/antigravity";

describe("Antigravity provider quota", () => {
  it("discovers the last valid plain-HTTP language-server port from local logs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ti-antigravity-"));
    const log = join(dir, "cli.log");
    await writeFile(log, [
      "listening on random port at 61000 for HTTPS",
      "listening on random port at 62000 for HTTP",
      "later listening on random port at 63000 for HTTP",
    ].join("\n"), "utf8");

    expect(discoverAntigravityPortFromText(await import("node:fs/promises").then(({ readFile }) => readFile(log, "utf8")))).toBe(63000);
    expect(await discoverAntigravityPort({ logPaths: [log] })).toBe(63000);
  });

  it("normalizes only Google model quotas and provider reset timestamps", () => {
    const snapshot = normalizeAntigravityPayloads({
      now: new Date("2026-10-07T23:00:00.000Z"),
      status: { userStatus: { planStatus: { planInfo: { planName: "AI Pro" } } } },
      models: {
        response: {
          models: {
            a: { modelProvider: "MODEL_PROVIDER_GOOGLE", displayName: "Gemini Pro", quotaInfo: { remainingFraction: 0.734, resetTime: "2026-10-08T02:00:00Z" } },
            b: { modelProvider: "MODEL_PROVIDER_GOOGLE", displayName: "Gemini Flash", quotaInfo: { remainingFraction: 0.5, resetTime: "2026-10-08T01:00:00Z" } },
            c: { modelProvider: "MODEL_PROVIDER_ANTHROPIC", displayName: "Claude", quotaInfo: { remainingFraction: 0.9 } },
          },
        },
      },
    });

    expect(snapshot.authState).toBe("active");
    expect(snapshot.plan).toBe("AI Pro");
    expect(snapshot.windows).toEqual([
      { label: "Gemini Flash", remainingPercent: 50, resetAt: "2026-10-08T01:00:00.000Z" },
      { label: "Gemini Pro", remainingPercent: 73.4, resetAt: "2026-10-08T02:00:00.000Z" },
    ]);
  });

  it("calls only loopback endpoints and never requires Google credentials", async () => {
    const requested: string[] = [];
    const fakeFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/GetUserStatus")) {
        return new Response(JSON.stringify({ userStatus: { planStatus: { planInfo: { planName: "AI Ultra" } } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ response: { models: {
        pro: { modelProvider: "MODEL_PROVIDER_GOOGLE", displayName: "Gemini Pro", quotaInfo: { remainingFraction: 0.25 } },
      } } }), { status: 200 });
    }) as typeof fetch;

    const snapshot = await fetchAntigravityQuotaSnapshot({
      port: 64000,
      fetchImpl: fakeFetch,
      now: new Date("2026-10-07T23:00:00.000Z"),
    });

    expect(snapshot.authState).toBe("active");
    expect(snapshot.windows[0].remainingPercent).toBe(25);
    expect(requested).toHaveLength(2);
    expect(requested.every((url) => url.startsWith("http://127.0.0.1:64000/"))).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("token");
  });

  it("returns unavailable when no local language-server port is discoverable", async () => {
    const snapshot = await fetchAntigravityQuotaSnapshot({
      logPaths: [join(tmpdir(), "definitely-not-an-antigravity-log")],
      now: new Date("2026-10-07T23:00:00.000Z"),
    });
    expect(snapshot.authState).toBe("unavailable");
    expect(snapshot.windows).toEqual([]);
  });

  it("fails closed when the loopback server returns unexpected data", async () => {
    const fakeFetch = vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch;
    const snapshot = await fetchAntigravityQuotaSnapshot({ port: 64001, fetchImpl: fakeFetch });
    expect(snapshot.authState).toBe("unavailable");
    expect(snapshot.note).not.toContain("not-json");
  });
});
