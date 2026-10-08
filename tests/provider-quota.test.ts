import { describe, expect, it, vi } from "vitest";
import { codexAuthPath, fetchCodexQuotaSnapshot, normalizeCodexUsagePayload } from "@/lib/quota/codex";
import { formatProviderQuotaSnapshot } from "@/lib/quota/types";

function jwt(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.signature`;
}

function oauthAuthJson() {
  return JSON.stringify({
    tokens: {
      access_token: "synthetic-access-token-value",
      account_id: "raw-account-id-fallback",
      id_token: jwt({
        "https://api.openai.com/auth": {
          account_id: "raw-account-id-primary",
          chatgpt_plan_type: "plus",
        },
        email: "private@example.test",
      }),
    },
  });
}

describe("Codex provider quota", () => {
  it("normalizes provider windows while keeping raw credentials out of the snapshot", async () => {
    const now = new Date("2026-10-07T20:00:00.000Z");
    const fakeFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer synthetic-access-token-value");
      expect(headers.get("ChatGPT-Account-Id")).toBe("raw-account-id-primary");
      return new Response(JSON.stringify({
        plan_type: "plus",
        rate_limit: {
          primary_window: {
            limit_window_seconds: 18_000,
            used_percent: 20.4,
            reset_after_seconds: 3_600,
          },
          secondary_window: {
            limit_window_seconds: 604_800,
            used_percent: 5,
            reset_at: 1_799_000_000,
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const snapshot = await fetchCodexQuotaSnapshot({
      authJson: oauthAuthJson(),
      now,
      fetchImpl: fakeFetch,
    });

    expect(snapshot.authState).toBe("active");
    expect(snapshot.plan).toBe("plus");
    expect(snapshot.windows).toEqual([
      { label: "5h", remainingPercent: 79.6, resetAt: "2026-10-07T21:00:00.000Z" },
      { label: "Wk", remainingPercent: 95, resetAt: new Date(1_799_000_000_000).toISOString() },
    ]);
    expect(snapshot.accountRef).toMatch(/^acct_[a-f0-9]{12}$/);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("synthetic-access-token-value");
    expect(serialized).not.toContain("raw-account-id-primary");
    expect(serialized).not.toContain("raw-account-id-fallback");
    expect(serialized).not.toContain("private@example.test");
    expect(formatProviderQuotaSnapshot(snapshot)).not.toContain("synthetic-access-token-value");
  });

  it("refuses API-key-only auth because it has no ChatGPT subscription window", async () => {
    const fakeFetch = vi.fn() as unknown as typeof fetch;
    const snapshot = await fetchCodexQuotaSnapshot({
      authJson: JSON.stringify({ OPENAI_API_KEY: "synthetic-api-key-value" }),
      now: new Date("2026-10-07T20:00:00.000Z"),
      fetchImpl: fakeFetch,
    });

    expect(snapshot.authState).toBe("unsupported_auth");
    expect(snapshot.windows).toEqual([]);
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).not.toContain("synthetic-api-key-value");
  });

  it("fails closed on malformed local auth without echoing the source", async () => {
    const snapshot = await fetchCodexQuotaSnapshot({
      authJson: "{not-json synthetic-secret-value",
      now: new Date("2026-10-07T20:00:00.000Z"),
    });

    expect(snapshot.authState).toBe("malformed");
    expect(JSON.stringify(snapshot)).not.toContain("synthetic-secret-value");
  });

  it("reports rejected OAuth as expired without refreshing or returning the token", async () => {
    const fakeFetch = vi.fn(async () => new Response("denied", { status: 401 })) as typeof fetch;
    const snapshot = await fetchCodexQuotaSnapshot({
      authJson: oauthAuthJson(),
      now: new Date("2026-10-07T20:00:00.000Z"),
      fetchImpl: fakeFetch,
    });

    expect(snapshot.authState).toBe("expired");
    expect(snapshot.note).toContain("Reauthenticate with the Codex CLI");
    expect(JSON.stringify(snapshot)).not.toContain("synthetic-access-token-value");
  });

  it("distinguishes a signed-in account with no numeric allocation from a provider failure", () => {
    const snapshot = normalizeCodexUsagePayload(
      { plan_type: "team", rate_limit: { primary_window: {}, secondary_window: {} } },
      { now: new Date("2026-10-07T20:00:00.000Z") },
    );

    expect(snapshot.authState).toBe("signed_in_no_allocation");
    expect(snapshot.windows.map((window) => window.remainingPercent)).toEqual([null, null]);
    expect(snapshot.note).toContain("did not report a numeric quota allocation");
  });

  it("resolves CODEX_HOME without inspecting provider contents", () => {
    expect(codexAuthPath({ CODEX_HOME: "/tmp/custom-codex" } as NodeJS.ProcessEnv, "/ignored-home")).toBe("/tmp/custom-codex/auth.json");
    expect(codexAuthPath({} as NodeJS.ProcessEnv, "/users/tester")).toBe("/users/tester/.codex/auth.json");
  });
});
