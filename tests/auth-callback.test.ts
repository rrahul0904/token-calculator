import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/auth/callback/route";

const keys = ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD", "NEXT_PUBLIC_WORKOS_REDIRECT_URI"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

describe("WorkOS callback hardening", () => {
  beforeEach(() => {
    process.env.WORKOS_API_KEY = "sk_test_release_callback";
    process.env.WORKOS_CLIENT_ID = "client_test_release_callback";
    process.env.WORKOS_COOKIE_PASSWORD = "0123456789abcdef0123456789abcdef";
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "https://preview.example.com/auth/callback";
  });

  afterEach(() => {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns a deterministic 400 when OAuth state is missing", async () => {
    const response = await GET(new NextRequest("https://preview.example.com/auth/callback"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_AUTH_CALLBACK" });
  });
});
