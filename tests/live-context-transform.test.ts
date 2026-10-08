import { describe, expect, it } from "vitest";

import {
  LocalContextRecoveryStore,
  detectLiveContextKind,
  transformLiveContextBlock,
} from "@/lib/optimization/live-context-transform";

describe("live context transform", () => {
  it("keeps the stable cache prefix byte-faithful", () => {
    const store = new LocalContextRecoveryStore();
    const content = "system prompt\n\n  exact spacing must remain  ";

    const result = transformLiveContextBlock({
      id: "system",
      zone: "stable_prefix",
      content,
      kind: "text",
    }, store);

    expect(result.status).toBe("protected_cache_prefix");
    expect(result.content).toBe(content);
    expect(result.cachePrefixPreserved).toBe(true);
    expect(result.recoveryRef).toBeNull();
    expect(store.size).toBe(0);
  });

  it("minifies live-zone JSON and preserves an exact local recovery path", () => {
    const store = new LocalContextRecoveryStore();
    const original = JSON.stringify([
      { id: 1, status: "ok", values: [1, 2, 3] },
      { id: 2, status: "ok", values: [4, 5, 6] },
    ], null, 2);

    const result = transformLiveContextBlock({
      id: "sensitive-caller-block-id",
      zone: "live_zone",
      content: original,
    }, store);

    expect(result.detectedKind).toBe("json");
    expect(result.status).toBe("transformed");
    expect(result.transform).toBe("json_minify");
    expect(result.estimatedTokensAfter).toBeLessThan(result.estimatedTokensBefore);
    expect(result.recoverable).toBe(true);
    expect(result.recoveryRef).not.toBeNull();
    expect(result.recoveryRef).not.toContain("sensitive-caller-block-id");
    expect(store.get(result.recoveryRef!)).toBe(original);
  });

  it("collapses repetitive logs without deleting the local original", () => {
    const store = new LocalContextRecoveryStore();
    const original = [
      "2026-10-08 INFO build started",
      "2026-10-08 INFO polling worker",
      "2026-10-08 INFO polling worker",
      "2026-10-08 INFO polling worker",
      "2026-10-08 ERROR compilation failed",
    ].join("\n");

    const result = transformLiveContextBlock({
      id: "build-log",
      zone: "live_zone",
      content: original,
    }, store);

    expect(result.detectedKind).toBe("log");
    expect(result.status).toBe("transformed");
    expect(result.content).toContain("repeated 2 more times");
    expect(store.get(result.recoveryRef!)).toBe(original);
  });

  it("keeps source code unchanged unless code transforms are explicitly enabled", () => {
    const store = new LocalContextRecoveryStore();
    const code = "export function add(a: number, b: number) {\n\n  return a + b;  \n}\n";

    expect(detectLiveContextKind(code)).toBe("code");

    const conservative = transformLiveContextBlock({
      id: "code",
      zone: "live_zone",
      content: code,
    }, store);

    expect(conservative.status).toBe("code_opt_in_required");
    expect(conservative.content).toBe(code);
    expect(store.size).toBe(0);

    const optedIn = transformLiveContextBlock({
      id: "code",
      zone: "live_zone",
      content: code,
    }, store, { allowCode: true });

    expect(optedIn.status).toBe("transformed");
    expect(optedIn.recoverable).toBe(true);
    expect(store.get(optedIn.recoveryRef!)).toBe(code);
  });

  it("refuses transforms that do not clear the configured local savings floor", () => {
    const store = new LocalContextRecoveryStore();
    const original = "hello   \n\n\nworld";

    const result = transformLiveContextBlock({
      id: "small-text",
      zone: "live_zone",
      content: original,
      kind: "text",
    }, store, { minimumEstimatedSavingsTokens: 50 });

    expect(result.status).toBe("insufficient_savings");
    expect(result.content).toBe(original);
    expect(result.estimatedTokensSaved).toBe(0);
    expect(store.size).toBe(0);
  });

  it("never labels its cheap pre-filter estimate as measured usage", () => {
    const store = new LocalContextRecoveryStore();
    const result = transformLiveContextBlock({
      id: "search",
      zone: "live_zone",
      kind: "search",
      content: "1. result A   \n1. result A   \n\n\nhttps://example.com/a",
    }, store);

    expect(result.estimateOnly).toBe(true);
    expect(result.cachePrefixPreserved).toBe(true);
  });
});
