import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { explicitRunIdFromText, safeGitHubDelivery, safeRepositoryName, verifyGitHubWebhook } from "@/lib/github/webhook";

describe("GitHub webhook boundary", () => {
  it("accepts only the correct HMAC SHA-256 signature", () => {
    const body = JSON.stringify({ action: "completed", repository: { full_name: "example/repo" } });
    const secret = "integration-webhook-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyGitHubWebhook(body, signature, secret)).toBe(true);
    expect(verifyGitHubWebhook(body, signature.replace(/.$/, "0"), secret)).toBe(false);
    expect(verifyGitHubWebhook(body, null, secret)).toBe(false);
    expect(verifyGitHubWebhook(body, "sha1=abc", secret)).toBe(false);
  });

  it("extracts only explicit Token Intelligence run markers", () => {
    expect(explicitRunIdFromText("deploy [token-intelligence-run:run_12345678] now")).toBe("run_12345678");
    expect(explicitRunIdFromText("ci ti-run:run_abcdefgh passed")).toBe("run_abcdefgh");
    expect(explicitRunIdFromText("unrelated run 12345678")).toBeNull();
  });

  it("validates GitHub delivery identifiers", () => {
    expect(safeGitHubDelivery(new Headers({ "x-github-delivery": "abc123-def456" }))).toBe("abc123-def456");
    expect(safeGitHubDelivery(new Headers({ "x-github-delivery": "../bad" }))).toBeNull();
    expect(safeGitHubDelivery(new Headers())).toBeNull();
  });

  it("reads repository identity only from the expected object shape", () => {
    expect(safeRepositoryName({ repository: { full_name: "example/repo" } })).toBe("example/repo");
    expect(safeRepositoryName({ repository: "example/repo" })).toBeNull();
    expect(safeRepositoryName({})).toBeNull();
  });
});
