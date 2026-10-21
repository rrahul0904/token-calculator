/**
 * Evidence-first, metadata-only recommendations for coding agent efficiency.
 * This never writes agent configuration, injects prompts, or asserts savings.
 * Fingerprints and fact IDs are opaque identifiers, never raw payloads.
 */
export interface SessionFactEvidence {
  factId: string;
  verdict: "confirmed" | "contradicted";
}

export interface ToolAttemptEvidence {
  fingerprintSha256: string;
  failed: boolean;
  progressEpoch: number;
}

export interface AgentSessionEvidence {
  sessionId: string;
  projectId: string;
  agent: "claude" | "codex" | "copilot" | "other";
  completeToolCatalog: boolean;
  loadedToolIds: string[];
  usedToolIds: string[];
  facts: SessionFactEvidence[];
  attempts: ToolAttemptEvidence[];
}

export interface AdvisorOptions {
  minSessions?: number;
  minFactConfirmations?: number;
  consecutiveFailures?: number;
  protectedToolIds?: readonly string[];
}

export interface AgentEfficiencyAdvice {
  projectId: string;
  agent: AgentSessionEvidence["agent"];
  observedSessions: number;
  completeCatalogCoverage: boolean;
  factProposals: { factId: string; supportingSessions: number; approvalRequired: true }[];
  unusedToolProposals: { toolId: string; loadedSessions: number; approvalRequired: true }[];
  failureLoopAdvisories: { sessionId: string; failureCount: number; humanReviewRequired: true }[];
  policy: {
    writesConfiguration: false;
    injectsUnreviewedFacts: false;
    autoPrunesTools: false;
    interruptsAgent: false;
    savingsVerified: false;
  };
}

const HASH = /^[a-f0-9]{64}$/;
const DEFAULT_PROTECTED = [
  "AskUserQuestion", "EnterPlanMode", "ExitPlanMode", "WebSearch", "WebFetch",
  "Task", "TodoWrite", "request_user_input", "update_plan", "web.run",
  "functions.exec", "guardian_tool", "approval", "verify", "test",
];

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function cleanId(value: string): string {
  return value.trim();
}

function failedSuffix(attempts: readonly ToolAttemptEvidence[]): number {
  const last = attempts.at(-1);
  if (!last || !last.failed || !HASH.test(last.fingerprintSha256) ||
      !Number.isSafeInteger(last.progressEpoch) || last.progressEpoch < 0) return 0;
  let count = 0;
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];
    if (!attempt.failed || attempt.fingerprintSha256 !== last.fingerprintSha256 ||
        attempt.progressEpoch !== last.progressEpoch) break;
    count += 1;
  }
  return count;
}

/** Recommendations only. Requires complete scoped catalogs and distinct sessions. */
export function adviseAgentSessionEfficiency(
  projectId: string,
  agent: AgentSessionEvidence["agent"],
  evidence: readonly AgentSessionEvidence[],
  options: AdvisorOptions = {},
): AgentEfficiencyAdvice {
  const minSessions = positiveInteger(options.minSessions, 5);
  const minFactConfirmations = positiveInteger(options.minFactConfirmations, 3);
  const consecutiveFailures = positiveInteger(options.consecutiveFailures, 3);
  const seen = new Set<string>();
  const sessions = evidence.filter((session) => {
    const id = cleanId(session.sessionId);
    if (!id || session.projectId !== projectId || session.agent !== agent || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const completeCatalogCoverage = sessions.length >= minSessions && sessions.every((session) =>
    session.completeToolCatalog && session.loadedToolIds.every((tool) => !!cleanId(tool)) &&
    session.usedToolIds.every((tool) => !!cleanId(tool) && session.loadedToolIds.includes(tool)),
  );

  const facts = new Map<string, { confirmed: Set<string>; contradicted: boolean }>();
  for (const session of sessions) {
    for (const fact of session.facts) {
      const id = cleanId(fact.factId);
      if (!id) continue;
      const record = facts.get(id) ?? { confirmed: new Set<string>(), contradicted: false };
      if (fact.verdict === "contradicted") record.contradicted = true;
      else if (fact.verdict === "confirmed") record.confirmed.add(session.sessionId);
      facts.set(id, record);
    }
  }
  const factProposals = [...facts.entries()]
    .filter(([, record]) => !record.contradicted && record.confirmed.size >= minFactConfirmations)
    .map(([factId, record]) => ({ factId, supportingSessions: record.confirmed.size, approvalRequired: true as const }))
    .sort((a, b) => a.factId.localeCompare(b.factId));

  const unusedToolProposals: AgentEfficiencyAdvice["unusedToolProposals"] = [];
  if (completeCatalogCoverage) {
    const protectedTools = new Set([...DEFAULT_PROTECTED, ...(options.protectedToolIds ?? [])]);
    const tools = new Map<string, number>();
    const used = new Set(sessions.flatMap((session) => session.usedToolIds.map(cleanId)));
    for (const session of sessions) {
      for (const tool of new Set(session.loadedToolIds.map(cleanId))) {
        tools.set(tool, (tools.get(tool) ?? 0) + 1);
      }
    }
    for (const [toolId, loadedSessions] of tools) {
      if (!protectedTools.has(toolId) && loadedSessions >= minSessions && !used.has(toolId)) {
        unusedToolProposals.push({ toolId, loadedSessions, approvalRequired: true });
      }
    }
    unusedToolProposals.sort((a, b) => a.toolId.localeCompare(b.toolId));
  }

  const failureLoopAdvisories = sessions
    .map((session) => ({ sessionId: session.sessionId, failureCount: failedSuffix(session.attempts), humanReviewRequired: true as const }))
    .filter((item) => item.failureCount >= consecutiveFailures)
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId));

  return {
    projectId, agent, observedSessions: sessions.length, completeCatalogCoverage,
    factProposals, unusedToolProposals, failureLoopAdvisories,
    policy: { writesConfiguration: false, injectsUnreviewedFacts: false, autoPrunesTools: false,
      interruptsAgent: false, savingsVerified: false },
  };
}
