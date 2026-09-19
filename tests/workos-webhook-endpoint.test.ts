import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REQUIRED_WORKOS_DIRECTORY_EVENTS,
  clearWorkosWebhookCache,
  ensureWorkosWebhookEndpoint,
  exactWorkosDirectoryEventSet,
  inspectWorkosWebhookProvider,
  resolveWorkosWebhookSecret,
  workosWebhookTargetUrl,
} from "../src/lib/workos/webhook-endpoint";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("WorkOS webhook endpoint management", () => {
  beforeEach(() => clearWorkosWebhookCache());

  it("requires the exact Directory Sync event set", () => {
    expect(exactWorkosDirectoryEventSet([...REQUIRED_WORKOS_DIRECTORY_EVENTS])).toBe(true);
    expect(exactWorkosDirectoryEventSet([...REQUIRED_WORKOS_DIRECTORY_EVENTS, "user.created"])).toBe(false);
    expect(exactWorkosDirectoryEventSet(REQUIRED_WORKOS_DIRECTORY_EVENTS.slice(1) as string[])).toBe(false);
  });

  it("derives the exact deployment webhook target", () => {
    expect(workosWebhookTargetUrl({
      VERCEL_ENV: "preview",
      VERCEL_URL: "preview-abc.vercel.app",
      APP_BASE_URL: "https://stable.example.test",
    })).toBe("https://preview-abc.vercel.app/api/webhooks/workos");

    expect(workosWebhookTargetUrl({
      VERCEL_ENV: "production",
      APP_BASE_URL: "https://app.example.test/",
    })).toBe("https://app.example.test/api/webhooks/workos");
  });

  it("always prefers an explicit signing secret without contacting WorkOS", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(resolveWorkosWebhookSecret({
      apiKey: "sk_test",
      explicitSecret: "whsec_explicit",
      targetUrl: "https://app.example.test/api/webhooks/workos",
      fetchImpl,
    })).resolves.toBe("whsec_explicit");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts only an enabled exact endpoint with a provider secret", async () => {
    const targetUrl = "https://app.example.test/api/webhooks/workos";
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [{
        id: "we_ready",
        endpoint_url: targetUrl,
        secret: "whsec_provider",
        status: "enabled",
        events: [...REQUIRED_WORKOS_DIRECTORY_EVENTS],
      }],
    })) as unknown as typeof fetch;

    await expect(inspectWorkosWebhookProvider({
      apiKey: "sk_test",
      targetUrl,
      fetchImpl,
    })).resolves.toMatchObject({
      ready: true,
      endpointId: "we_ready",
      secretMatchesExplicit: null,
      error: null,
    });

    await expect(resolveWorkosWebhookSecret({
      apiKey: "sk_test",
      targetUrl,
      fetchImpl,
    })).resolves.toBe("whsec_provider");
  });

  it("fails provider readiness when an explicit secret does not match", async () => {
    const targetUrl = "https://app.example.test/api/webhooks/workos";
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [{
        id: "we_ready",
        endpoint_url: targetUrl,
        secret: "whsec_provider",
        status: "enabled",
        events: [...REQUIRED_WORKOS_DIRECTORY_EVENTS],
      }],
    })) as unknown as typeof fetch;

    await expect(inspectWorkosWebhookProvider({
      apiKey: "sk_test",
      targetUrl,
      explicitSecret: "whsec_stale",
      fetchImpl,
    })).resolves.toMatchObject({
      ready: false,
      endpointId: "we_ready",
      secretMatchesExplicit: false,
      error: "WORKOS_WEBHOOK_SECRET_MISMATCH",
    });
  });

  it("updates the designated endpoint without creating a second Preview endpoint", async () => {
    const targetUrl = "https://preview-new.vercel.app/api/webhooks/workos";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method) {
        return jsonResponse({
          data: [{
            id: "we_staging",
            endpoint_url: "https://preview-old.vercel.app/api/webhooks/workos",
            secret: "whsec_existing",
            status: "enabled",
            events: [...REQUIRED_WORKOS_DIRECTORY_EVENTS],
          }],
        });
      }
      expect(url).toBe("https://api.workos.com/webhook_endpoints/we_staging");
      expect(init.method).toBe("PATCH");
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({
        endpoint_url: targetUrl,
        status: "enabled",
        events: [...REQUIRED_WORKOS_DIRECTORY_EVENTS],
      });
      return jsonResponse({
        id: "we_staging",
        endpoint_url: targetUrl,
        secret: "whsec_rotated",
        status: "enabled",
        events: [...REQUIRED_WORKOS_DIRECTORY_EVENTS],
      });
    }) as unknown as typeof fetch;

    const result = await ensureWorkosWebhookEndpoint({
      apiKey: "sk_test",
      targetUrl,
      endpointId: "we_staging",
      fetchImpl,
    });

    expect(result).toEqual({
      action: "updated",
      endpointId: "we_staging",
      targetUrl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("whsec_");
  });

  it("fails closed when a designated endpoint id is absent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] })) as unknown as typeof fetch;
    await expect(ensureWorkosWebhookEndpoint({
      apiKey: "sk_test",
      targetUrl: "https://preview.vercel.app/api/webhooks/workos",
      endpointId: "we_missing",
      fetchImpl,
    })).rejects.toThrow("WORKOS_WEBHOOK_ENDPOINT_ID_NOT_FOUND");
  });
});
