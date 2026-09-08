import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { GET as signOut } from "@/app/sign-out/route";

const keys = ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD", "NEXT_PUBLIC_WORKOS_REDIRECT_URI"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("sign-out route", () => {
  it("fails closed instead of initializing an unconfigured AuthKit runtime", async () => {
    for (const key of keys) delete process.env[key];

    const response = await signOut();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "AUTH_NOT_CONFIGURED",
    });
  });
});
