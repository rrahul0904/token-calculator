import { describe, expect, it, vi } from "vitest";
import { claudeCredentialsPath, fetchClaudeQuotaSnapshot, normalizeClaudeUsagePayload } from "@/lib/quota/claude";

function fixtureCredentials(expiresAt: number) {
  return JSON.stringify({
    organizationUuid: "fixture-org-id",
    claudeAiOauth: {
      accessToken: "fixture-access-value",
      expiresAt,
      subscriptionType: "max",
      scopes: [],
    },
  });
}

describe("Claude provider quota", () => {
  it("normalizes five-hour and weekly windows", async () => {
    const now = new Date("2026-10-08T03:00:00.000Z");
    const fakeFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer fixture-access-value");
      return new Response(JSON.stringify({
        five_hour: { utilization: 21.25, resets_at: "2026-10-08T04:30:00Z" },
        seven_day: { utilization: 6.5, resets_at: "2026-10-12T00:00:00Z" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const snapshot = await fetchClaudeQuotaSnapshot({
      credentialsJson: fixtureCredentials(new Date("2026-10-08T05:00:00.000Z").getTime()),
      now,
      fetchImpl: fakeFetch,
    });

    expect(snapshot.authState).toBe("active");
    expect(snapshot.plan).toBe("max");
    expect(snapshot.accountRef).toMatch(/^org_[a-f0-9]{12}$/);
    expect(snapshot.windows).toEqual([
      { label: "5h", remainingPercent: 78.8, resetAt: "2026-10-08T04:30:00.000Z" },
      { label: "Wk", remainingPercent: 93.5, resetAt: "2026-10-12T00:00:00.000Z" },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("fixture-access-value");
    expect(JSON.stringify(snapshot)).not.toContain("fixture-org-id");
  });

  it("does not call the provider when the local session is already expired", async () => {
    const fakeFetch = vi.fn() as unknown as typeof fetch;
    const snapshot = await fetchClaudeQuotaSnapshot({
      credentialsJson: fixtureCredentials(new Date("2026-10-08T01:00:00.000Z").getTime()),
      now: new Date("2026-10-08T03:00:00.000Z"),
      fetchImpl: fakeFetch,
    });

    expect(snapshot.authState).toBe("expired");
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("reports rejected authorization as expired", async () => {
    const fakeFetch = vi.fn(async () => new Response("denied", { status: 401 })) as typeof fetch;
    const snapshot = await fetchClaudeQuotaSnapshot({
      credentialsJson: fixtureCredentials(new Date("2026-10-08T05:00:00.000Z").getTime()),
      now: new Date("2026-10-08T03:00:00.000Z"),
      fetchImpl: fakeFetch,
    });

    expect(snapshot.authState).toBe("expired");
    expect(snapshot.note).toContain("Reauthenticate with Claude Code");
  });

  it("keeps missing allocation distinct from provider failure", () => {
    const snapshot = normalizeClaudeUsagePayload(
      { five_hour: {}, seven_day: {} },
      { now: new Date("2026-10-08T03:00:00.000Z"), plan: "pro" },
    );
    expect(snapshot.authState).toBe("signed_in_no_allocation");
    expect(snapshot.windows.map((window) => window.remainingPercent)).toEqual([null, null]);
  });

  it("bounds remaining quota to zero through one hundred", () => {
    const snapshot = normalizeClaudeUsagePayload({
      five_hour: { utilization: -8 },
      seven_day: { utilization: 130 },
    });
    expect(snapshot.windows[0].remainingPercent).toBe(100);
    expect(snapshot.windows[1].remainingPercent).toBe(0);
  });

  it("uses the Claude Code local credential path", () => {
    expect(claudeCredentialsPath("/users/tester")).toBe("/users/tester/.claude/.credentials.json");
  });
});
