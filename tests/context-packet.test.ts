import { describe, expect, it } from "vitest";
import { buildContextPacket } from "@/lib/optimization/context-packet";

const fixture = [
  { path: "src/lib/example.ts", content: ["export function add(x: number, y: number) {", "  return x + y;", "}", "", "export function routeBudget(used: number) {", "  return used <= 10;", "}", "", "// context budget planner"].join("\n") },
  { path: "node_modules/ignore.js", content: "routeBudget routeBudget" },
  { path: ".env", content: "API_KEY=supersecret routeBudget" },
];

describe("bounded source context packets", () => {
  it("retrieves relevant numbered ranges while excluding unsafe files", () => {
    const result = buildContextPacket({ files: fixture, query: "routeBudget", contextLines: 1 });
    expect(result.sections).toHaveLength(1);
    expect(result.contextText).toContain("5: export function routeBudget");
    expect(result.contextText).not.toContain("supersecret");
    expect(result.skippedFiles).toHaveLength(2);
    expect(result.evidence).toBe("deterministic_character_proxy");
  });
  it("rejects traversals, credentials and duplicate paths", () => {
    const result = buildContextPacket({ query: "hello", files: [
      { path: "../outside.ts", content: "hello" },
      { path: "src/id_rsa", content: "hello" },
      { path: "ok.ts", content: "hello" },
      { path: "ok.ts", content: "hello" },
    ] });
    expect(result.sections).toHaveLength(1);
    expect(result.skippedFiles.map((x) => x.reason)).toEqual(["excluded_or_unsafe_path", "excluded_or_unsafe_path", "duplicate_path"]);
    const blocked = buildContextPacket({ query: "secret", files: [{ path: "src/ok.ts", content: "-----BEGIN RSA PRIVATE KEY-----\nsecret body" }] });
    expect(blocked.skippedFiles[0].reason).toBe("private_key_block_detected");
  });
  it("bounds output, reports a character proxy, and stays deterministic", () => {
    const files = [{ path: "src/huge.ts", content: Array.from({ length: 200 }, (_, i) => "const useBudget" + i + " = true;").join("\n") }];
    const args = { files, query: "useBudget", maxCharacters: 256, contextLines: 0, maxMatchesPerFile: 20 };
    const first = buildContextPacket(args);
    expect(first.selectedCharacters).toBeLessThanOrEqual(256);
    expect(first.truncation).toBe(true);
    expect(first.characterReductionPercent).toBeGreaterThan(0);
    expect(first).toEqual(buildContextPacket(args));
  });
  it("redacts simple inline credentials", () => {
    const result = buildContextPacket({ query: "password", contextLines: 0, files: [{ path: "src/config.ts", content: 'password = "do-not-leak"' }] });
    expect(result.contextText).toContain("[REDACTED]");
    expect(result.contextText).not.toContain("do-not-leak");
  });
  it("recommends against packets for small files and no matches", () => {
    const tiny = buildContextPacket({ query: "hello", files: [{ path: "ok.ts", content: "hello" }] });
    expect(tiny.recommendedStrategy).toBe("full_authorized_read");
    const absent = buildContextPacket({ query: "zzz", files: [{ path: "src/empty.ts", content: "hello" }] });
    expect(absent.sections).toEqual([]);
    expect(absent.recommendedStrategy).toBe("no_relevant_matches");
    expect(buildContextPacket({ query: "hello", files: [] }).characterReductionPercent).toBeNull();
  });
  it("rejects invalid budgets and search terms", () => {
    expect(() => buildContextPacket({ query: "x", files: [] })).toThrow();
    expect(() => buildContextPacket({ query: "valid", files: [], maxCharacters: -1 })).toThrow(RangeError);
  });
});
