import { describe, expect, it } from "vitest";
import { adviseAgentSessionEfficiency, type AgentSessionEvidence } from "../src/lib/optimization/agent-session-advisor";

const fingerprint = "a".repeat(64);
const session = (id: string, patch: Partial<AgentSessionEvidence> = {}): AgentSessionEvidence => ({
  sessionId: id, projectId: "p1", agent: "codex", completeToolCatalog: true,
  loadedToolIds: ["unused-tool", "used-tool", "AskUserQuestion"],
  usedToolIds: ["used-tool"], facts: [{ factId: "test-entrypoint", verdict: "confirmed" }],
  attempts: [], ...patch,
});

describe("agent session efficiency advisory", () => {
  it("proposes only corroborated facts and unused unprotected tools without acting", () => {
    const result = adviseAgentSessionEfficiency("p1", "codex", Array.from({ length: 5 }, (_, i) => session(String(i))));
    expect(result.completeCatalogCoverage).toBe(true);
    expect(result.factProposals).toEqual([{ factId: "test-entrypoint", supportingSessions: 5, approvalRequired: true }]);
    expect(result.unusedToolProposals).toEqual([{ toolId: "unused-tool", loadedSessions: 5, approvalRequired: true }]);
    expect(Object.values(result.policy).every((value) => value === false)).toBe(true);
  });
  it("fails closed for partial catalogs, protects tools, and never prunes any used tool", () => {
    const evidence = Array.from({ length: 5 }, (_, i) => session(String(i)));
    evidence[4] = session("4", { completeToolCatalog: false });
    expect(adviseAgentSessionEfficiency("p1", "codex", evidence).unusedToolProposals).toEqual([]);
    evidence[4] = session("4", { usedToolIds: ["used-tool", "unused-tool"] });
    expect(adviseAgentSessionEfficiency("p1", "codex", evidence).unusedToolProposals).toEqual([]);
  });
  it("does not count duplicated sessions or evidence from other projects", () => {
    const evidence = [session("1"), session("1"), session("2", { projectId: "other" })];
    const r = adviseAgentSessionEfficiency("p1", "codex", evidence);
    expect(r.observedSessions).toBe(1);
    expect(r.unusedToolProposals).toEqual([]);
    expect(r.factProposals).toEqual([]);
  });
  it("blocks a contradicted fact regardless of confirmations", () => {
    const evidence = Array.from({ length: 5 }, (_, i) => session(String(i)));
    evidence[4].facts.push({ factId: "test-entrypoint", verdict: "contradicted" });
    expect(adviseAgentSessionEfficiency("p1", "codex", evidence).factProposals).toEqual([]);
  });
  it("only flags failed repeated fingerprints without intervening progress", () => {
    const failures = Array.from({ length: 3 }, () => ({ fingerprintSha256: fingerprint, failed: true, progressEpoch: 7 }));
    const result = adviseAgentSessionEfficiency("p1", "codex", [session("1", { attempts: failures })]);
    expect(result.failureLoopAdvisories).toEqual([{ sessionId: "1", failureCount: 3, humanReviewRequired: true }]);
    expect(adviseAgentSessionEfficiency("p1", "codex", [session("1", { attempts: [...failures.slice(0, 2), { ...failures[2], progressEpoch: 8 }] })]).failureLoopAdvisories).toEqual([]);
    expect(adviseAgentSessionEfficiency("p1", "codex", [session("1", { attempts: [...failures.slice(0, 2), { ...failures[2], failed: false }] })]).failureLoopAdvisories).toEqual([]);
  });
  it("refuses raw non-hash signatures as failure evidence", () => {
    expect(adviseAgentSessionEfficiency("p1", "codex", [session("1", { attempts: Array.from({ length: 4 }, () => ({ fingerprintSha256: "npm test failed", failed: true, progressEpoch: 0 })) })]).failureLoopAdvisories).toEqual([]);
  });
});
