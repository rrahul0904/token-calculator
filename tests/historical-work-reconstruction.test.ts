import { describe, expect, it } from "vitest";
import { applyHistoricalWorkReview, reconstructHistoricalWork, type HistoricalWorkInput } from "@/lib/historical-work/reconstruction";

function input(turns: HistoricalWorkInput["turns"] = []): HistoricalWorkInput {
  return {
    schemaVersion: "1", sourceRef: "synthetic-session", projectRef: "synthetic-project",
    turns,
  };
}

function turn(sourceRef: string, occurredAt: string | null, overrides: Partial<HistoricalWorkInput["turns"][number]> = {}): HistoricalWorkInput["turns"][number] {
  return {
    sourceRef, occurredAt, modelRef: "model-fixture",
    usage: { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 3 },
    reportedCostUsd: null, estimatedCostUsd: 0.2, boundaryHint: "none",
    ...overrides,
  };
}

describe("historical work reconstruction", () => {
  it("replays deterministically with opaque refs and metadata-only output", () => {
    const value = input([
      turn("codex-event-2", "2026-10-01T12:10:00.000Z"),
      turn("claude-event-1", "2026-10-01T12:00:00.000Z", { reportedCostUsd: 0, estimatedCostUsd: 0.3 }),
    ]);
    const first = reconstructHistoricalWork(value);
    expect(reconstructHistoricalWork(value)).toEqual(first);
    expect(first.turns.map((entry) => entry.reportedCostUsd)).toEqual([0, null]);
    expect(first.turns.map((entry) => entry.pricingCoverage)).toEqual(["reported", "estimated"]);
    expect(first.privacy).toMatchObject({ readOnly: true, networkUsed: false, rawPromptsRetained: false, sourcePathsRetained: false });
    expect(JSON.stringify(first)).not.toContain("codex-event-2");
    expect(first.tasks).toHaveLength(1);
  });

  it("segments only explicit, compaction-with-pause, and configured time-gap boundaries", () => {
    const result = reconstructHistoricalWork(input([
      turn("a", "2026-10-01T00:00:00.000Z"),
      turn("b", "2026-10-01T00:05:00.000Z", { boundaryHint: "explicit" }),
      turn("c", "2026-10-01T00:20:00.000Z", { boundaryHint: "compaction" }),
      turn("d", "2026-10-01T01:00:00.000Z"),
      turn("e", "2026-10-01T07:10:00.000Z"),
    ]));
    expect(result.review.status).toBe("unreviewed");
    expect(result.tasks.map((task) => task.boundaryBefore)).toEqual(["session_start", "explicit", "compaction", "pause", "pause"]);
    expect(result.review.boundaries.map((item) => item.evidence)).toEqual(["session_start", "explicit", "compaction", "pause", "pause"]);
    expect(result.sittings).toHaveLength(2);
  });

  it("keeps missing times partial and avoids negative time on out-of-order input", () => {
    const result = reconstructHistoricalWork(input([
      turn("later", "2026-10-01T12:00:00.000Z"),
      turn("unknown-time", null),
      turn("earlier", "2026-10-01T11:55:00.000Z"),
    ]));
    expect(result.coverage).toBe("partial");
    expect(result.turns.filter((entry) => entry.occurredAt === null)).toHaveLength(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.sittings.every((sitting) => sitting.startedAt === null || sitting.endedAt === null || Date.parse(sitting.endedAt) >= Date.parse(sitting.startedAt))).toBe(true);
  });

  it("keeps projects isolated and rejects unrecognized contract versions and private-content keys", () => {
    const history = input([turn("same-source", "2026-10-01T12:00:00.000Z")]);
    const first = reconstructHistoricalWork(history);
    const second = reconstructHistoricalWork({ ...history, projectRef: "another-project" });
    expect(first.sourceRef).not.toBe(second.sourceRef);
    expect(first.projectRef).not.toBe(second.projectRef);
    expect(first.turns[0].turnRef).not.toBe(second.turns[0].turnRef);
    expect(() => reconstructHistoricalWork({ ...history, schemaVersion: "2" })).toThrow();
    expect(() => reconstructHistoricalWork({ ...history, prompt: "private text" })).toThrow();
  });

  it("keeps duplicate source events idempotent in the reconstructed event references", () => {
    const duplicate = turn("same-event", "2026-10-01T12:00:00.000Z");
    const result = reconstructHistoricalWork(input([duplicate, duplicate]));
    expect(reconstructHistoricalWork(input([duplicate]))).toEqual(result);
    expect(result.turns).toHaveLength(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].turnRefs).toHaveLength(1);
    expect(() => reconstructHistoricalWork(input([
      turn("same-event", "2026-10-01T12:00:00.000Z", { estimatedCostUsd: 0.3 }), duplicate,
    ]))).toThrow("Conflicting duplicate history event");
  });

  it("calibrates evidence confidence and supports an editable in-memory boundary review", () => {
    const result = reconstructHistoricalWork(input([
      turn("a", "2026-10-01T12:00:00.000Z"),
      turn("b", "2026-10-01T12:05:00.000Z"),
    ]));
    expect(result.tasks.map((task) => task.confidence)).toEqual(["medium"]);
    expect(result.review.boundaries[1]).toMatchObject({ decision: "continue", evidence: "none", overrodeEvidence: false });
    const reviewed = applyHistoricalWorkReview(result, {
      schemaVersion: "1",
      boundaries: result.turns.map((entry) => ({ beforeTurnRef: entry.turnRef, decision: "boundary" })),
    });
    expect(reviewed.tasks).toHaveLength(2);
    expect(reviewed.review.status).toBe("reviewed");
    expect(reviewed.tasks[1].boundaryBefore).toBe("reviewed");
    expect(reviewed.review.boundaries.map((item) => item.decision)).toEqual(["boundary", "boundary"]);
    expect(() => applyHistoricalWorkReview(result, { schemaVersion: "1", boundaries: [] })).toThrow();
  });

  it("makes reviewer overrides explicit when evidence suggested a boundary", () => {
    const result = reconstructHistoricalWork(input([
      turn("a", "2026-10-01T12:00:00.000Z"),
      turn("b", "2026-10-01T12:45:00.000Z"),
    ]));
    const reviewed = applyHistoricalWorkReview(result, {
      schemaVersion: "1",
      boundaries: result.turns.map((entry, index) => ({ beforeTurnRef: entry.turnRef, decision: index === 0 ? "boundary" : "continue" })),
    });
    expect(reviewed.tasks).toHaveLength(1);
    expect(reviewed.review.boundaries[1]).toMatchObject({ decision: "continue", evidence: "pause", overrodeEvidence: true });
  });

  it("extends sitting end time through the last turn before and after review", () => {
    const result = reconstructHistoricalWork(input([
      turn("a", "2026-10-01T12:00:00.000Z"),
      turn("b", "2026-10-01T12:05:00.000Z"),
    ]));
    expect(result.sittings[0].endedAt).toBe("2026-10-01T12:05:00.000Z");
    const reviewed = applyHistoricalWorkReview(result, {
      schemaVersion: "1",
      boundaries: result.turns.map((entry, index) => ({ beforeTurnRef: entry.turnRef, decision: index === 0 ? "boundary" : "continue" })),
    });
    expect(reviewed.sittings[0].endedAt).toBe("2026-10-01T12:05:00.000Z");
  });
});
