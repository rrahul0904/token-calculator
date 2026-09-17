export type EvaluatorKind = "json_schema" | "tests_passed" | "expected_tool" | "required_artifact" | "ci_result" | "custom_boolean" | "custom_numeric";

export interface EvaluationObservation {
  outputJson?: unknown;
  testsPassed?: boolean | null;
  toolsInvoked?: string[];
  artifacts?: Array<{ type: string; reference?: string | null }>;
  ciPassed?: boolean | null;
  custom?: Record<string, boolean | number | null | undefined>;
}

export type EvaluatorSpec =
  | { id: string; kind: "json_schema"; requiredKeys: string[] }
  | { id: string; kind: "tests_passed"; required: boolean }
  | { id: string; kind: "expected_tool"; tool: string }
  | { id: string; kind: "required_artifact"; artifactType: string }
  | { id: string; kind: "ci_result"; required: boolean }
  | { id: string; kind: "custom_boolean"; key: string; expected: boolean }
  | { id: string; kind: "custom_numeric"; key: string; operator: ">=" | ">" | "<=" | "<" | "=="; threshold: number };

export interface EvaluatorResult {
  evaluatorId: string;
  kind: EvaluatorKind;
  passed: boolean;
  score: number;
  detail: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareNumber(value: number, operator: ">=" | ">" | "<=" | "<" | "==", threshold: number) {
  if (operator === ">=") return value >= threshold;
  if (operator === ">") return value > threshold;
  if (operator === "<=") return value <= threshold;
  if (operator === "<") return value < threshold;
  return value === threshold;
}

export function evaluateDeterministic(spec: EvaluatorSpec, observation: EvaluationObservation): EvaluatorResult {
  let passed = false;
  let detail = "";
  if (spec.kind === "json_schema") {
    const record = isRecord(observation.outputJson) ? observation.outputJson : null;
    const missing = record ? spec.requiredKeys.filter((key) => !(key in record)) : spec.requiredKeys;
    passed = Boolean(record) && missing.length === 0;
    detail = passed ? "Required JSON keys are present." : `Missing required JSON keys: ${missing.join(", ") || "output is not an object"}`;
  } else if (spec.kind === "tests_passed") {
    passed = observation.testsPassed === spec.required;
    detail = `testsPassed=${String(observation.testsPassed)} expected=${String(spec.required)}`;
  } else if (spec.kind === "expected_tool") {
    passed = (observation.toolsInvoked ?? []).includes(spec.tool);
    detail = passed ? `Observed required tool ${spec.tool}.` : `Required tool ${spec.tool} was not observed.`;
  } else if (spec.kind === "required_artifact") {
    passed = (observation.artifacts ?? []).some((artifact) => artifact.type === spec.artifactType);
    detail = passed ? `Observed required artifact ${spec.artifactType}.` : `Required artifact ${spec.artifactType} was not observed.`;
  } else if (spec.kind === "ci_result") {
    passed = observation.ciPassed === spec.required;
    detail = `ciPassed=${String(observation.ciPassed)} expected=${String(spec.required)}`;
  } else if (spec.kind === "custom_boolean") {
    passed = observation.custom?.[spec.key] === spec.expected;
    detail = `${spec.key}=${String(observation.custom?.[spec.key])} expected=${String(spec.expected)}`;
  } else {
    const value = observation.custom?.[spec.key];
    passed = typeof value === "number" && Number.isFinite(value) && compareNumber(value, spec.operator, spec.threshold);
    detail = `${spec.key}=${String(value)} ${spec.operator} ${spec.threshold}`;
  }
  return { evaluatorId: spec.id, kind: spec.kind, passed, score: passed ? 1 : 0, detail };
}

export function evaluateSuite(specs: EvaluatorSpec[], observation: EvaluationObservation) {
  const results = specs.map((spec) => evaluateDeterministic(spec, observation));
  const qualityScore = results.length ? results.reduce((sum, result) => sum + result.score, 0) / results.length : null;
  return { results, passed: results.every((result) => result.passed), qualityScore };
}

export interface ExperimentSummary {
  variant: "baseline" | "candidate";
  qualityScore: number;
  successRate: number;
  medianCostUsd: number;
  sampleSize: number;
}

export function evaluateRegressionGate(args: {
  baseline: ExperimentSummary;
  candidate: ExperimentSummary;
  minimumQualityScore?: number;
  qualityNonInferiorityMargin?: number;
  maxCostRegressionPct?: number;
}) {
  if (args.baseline.sampleSize <= 0 || args.candidate.sampleSize <= 0) throw new Error("EXPERIMENT_SAMPLE_REQUIRED");
  const minimumQualityScore = args.minimumQualityScore ?? 0;
  const qualityMargin = args.qualityNonInferiorityMargin ?? 0.02;
  const maxCostRegressionPct = args.maxCostRegressionPct ?? 0;
  const qualityFloor = Math.max(minimumQualityScore, args.baseline.qualityScore - qualityMargin);
  const qualityPassed = args.candidate.qualityScore >= qualityFloor;
  const costDeltaPct = args.baseline.medianCostUsd <= 0 ? null : (args.candidate.medianCostUsd - args.baseline.medianCostUsd) / args.baseline.medianCostUsd * 100;
  const costPassed = costDeltaPct === null ? args.candidate.medianCostUsd <= args.baseline.medianCostUsd : costDeltaPct <= maxCostRegressionPct;
  return {
    passed: qualityPassed && costPassed,
    qualityPassed,
    costPassed,
    qualityFloor,
    candidateQualityScore: args.candidate.qualityScore,
    costDeltaPct,
    baseline: args.baseline,
    candidate: args.candidate,
    evidenceType: "experiment_verified" as const,
  };
}
