export type StructuredEncodingMeasurementScope = "payload_only" | "full_session";
export type StructuredEncodingEvidenceType = "measured_before_after" | "historical_observation" | "modeled_estimate" | "unknown";
export type StructuredEncodingQualityGate = "passed" | "failed" | "not_run";
export type StructuredEncodingFidelityGate = "verified" | "failed" | "not_run";

export type StructuredEncodingStatus =
  | "verified_savings"
  | "payload_reduction_only"
  | "candidate"
  | "insufficient_samples"
  | "quality_unverified"
  | "quality_regression"
  | "fidelity_unverified"
  | "fidelity_failure"
  | "token_regression"
  | "no_savings_evidence";

export interface StructuredEncodingCandidate {
  id: string;
  format: string;
  formatVersion?: string | null;
  measurementScope: StructuredEncodingMeasurementScope;
  evidenceType: StructuredEncodingEvidenceType;
  qualityGate: StructuredEncodingQualityGate;
  fidelityGate: StructuredEncodingFidelityGate;
  sampleSize: number;
  baselinePayloadTokens: number | null;
  encodedPayloadTokens: number | null;
  baselineSessionTokens?: number | null;
  candidateSessionTokens?: number | null;
  formatInstructionTokens?: number | null;
  decodeRepairTokens?: number | null;
  retryTokens?: number | null;
  requiredFields?: string[];
  preservedFields?: string[];
  evidenceSource?: string | null;
}

export interface StructuredEncodingEvaluation {
  id: string;
  format: string;
  formatVersion: string | null;
  status: StructuredEncodingStatus;
  claimable: boolean;
  measurementScope: StructuredEncodingMeasurementScope;
  evidenceType: StructuredEncodingEvidenceType;
  qualityGate: StructuredEncodingQualityGate;
  fidelityGate: StructuredEncodingFidelityGate;
  sampleSize: number;
  baselinePayloadTokens: number | null;
  encodedPayloadTokens: number | null;
  payloadSavingsTokens: number | null;
  payloadSavingsPct: number | null;
  baselineSessionTokens: number | null;
  candidateSessionTokens: number | null;
  formatInstructionTokens: number;
  decodeRepairTokens: number;
  retryTokens: number;
  netCandidateSessionTokens: number | null;
  measuredSessionSavingsTokens: number | null;
  measuredSessionSavingsPct: number | null;
  requiredFields: string[];
  preservedFields: string[];
  missingFields: string[];
  evidenceSource: string | null;
  verificationRequired: string | null;
}

function nullableNonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number {
  return nullableNonNegative(value) ?? 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function requirementFor(
  status: StructuredEncodingStatus,
  missingFields: string[],
  minimumSampleSize: number,
): string | null {
  switch (status) {
    case "verified_savings":
      return null;
    case "payload_reduction_only":
      return "Measure the same workload end to end; fewer serialization tokens alone do not prove full-session savings.";
    case "fidelity_failure":
      return `Restore lossless task-required structure before adoption: ${missingFields.join(", ") || "round-trip mismatch"}.`;
    case "fidelity_unverified":
      return "Verify encode/decode fidelity and required-field preservation on the evaluated dataset.";
    case "quality_regression":
      return "Fix the task-quality regression and repeat the same versioned workload.";
    case "quality_unverified":
      return "Run the same task-quality gate for baseline and encoded representations.";
    case "token_regression":
      return "Investigate instruction, repair and retry overhead; the encoded session used more tokens than baseline.";
    case "insufficient_samples":
      return `Collect at least ${minimumSampleSize} comparable measured full-session samples.`;
    case "candidate":
      return "Capture measured before/after full-session receipts; modeled or historical token estimates cannot verify savings.";
    case "no_savings_evidence":
      return "Capture valid baseline/candidate full-session token totals with a positive measured delta.";
  }
}

/**
 * Evidence gate for TOON/LEAN/compact-JSON/YAML-like structured prompt encodings.
 * Payload compactness is reported separately from full-session economics so
 * parser repair, format instructions and retries cannot disappear from the
 * savings denominator.
 */
export function evaluateStructuredEncoding(
  candidate: StructuredEncodingCandidate,
  options: { minimumSampleSize?: number } = {},
): StructuredEncodingEvaluation {
  const minimumSampleSize = Math.max(1, Math.trunc(options.minimumSampleSize ?? 5));
  const baselinePayloadTokens = nullableNonNegative(candidate.baselinePayloadTokens);
  const encodedPayloadTokens = nullableNonNegative(candidate.encodedPayloadTokens);
  const payloadSavingsTokens = baselinePayloadTokens !== null && encodedPayloadTokens !== null
    ? baselinePayloadTokens - encodedPayloadTokens
    : null;
  const payloadSavingsPct = payloadSavingsTokens !== null && baselinePayloadTokens !== null && baselinePayloadTokens > 0
    ? round((payloadSavingsTokens / baselinePayloadTokens) * 100)
    : null;

  const baselineSessionTokens = nullableNonNegative(candidate.baselineSessionTokens);
  const candidateSessionTokens = nullableNonNegative(candidate.candidateSessionTokens);
  const formatInstructionTokens = nonNegative(candidate.formatInstructionTokens);
  const decodeRepairTokens = nonNegative(candidate.decodeRepairTokens);
  const retryTokens = nonNegative(candidate.retryTokens);
  const netCandidateSessionTokens = candidateSessionTokens === null
    ? null
    : candidateSessionTokens + formatInstructionTokens + decodeRepairTokens + retryTokens;
  const measuredSessionSavingsTokens = baselineSessionTokens !== null && netCandidateSessionTokens !== null
    ? baselineSessionTokens - netCandidateSessionTokens
    : null;
  const measuredSessionSavingsPct = measuredSessionSavingsTokens !== null && baselineSessionTokens !== null && baselineSessionTokens > 0
    ? round((measuredSessionSavingsTokens / baselineSessionTokens) * 100)
    : null;

  const requiredFields = normalizeStrings(candidate.requiredFields);
  const preservedFields = normalizeStrings(candidate.preservedFields);
  const preserved = new Set(preservedFields);
  const missingFields = requiredFields.filter((field) => !preserved.has(field));
  const sampleSize = Math.max(0, Math.trunc(candidate.sampleSize));

  let status: StructuredEncodingStatus;
  if (candidate.fidelityGate === "failed" || missingFields.length > 0) status = "fidelity_failure";
  else if (candidate.fidelityGate !== "verified") status = "fidelity_unverified";
  else if (candidate.qualityGate === "failed") status = "quality_regression";
  else if (measuredSessionSavingsTokens !== null && measuredSessionSavingsTokens < 0) status = "token_regression";
  else if (candidate.measurementScope !== "full_session") status = "payload_reduction_only";
  else if (baselineSessionTokens === null || netCandidateSessionTokens === null || baselineSessionTokens === 0 || measuredSessionSavingsTokens === 0) status = "no_savings_evidence";
  else if (candidate.qualityGate !== "passed") status = "quality_unverified";
  else if (candidate.evidenceType !== "measured_before_after") status = "candidate";
  else if (sampleSize < minimumSampleSize) status = "insufficient_samples";
  else status = "verified_savings";

  return {
    id: candidate.id,
    format: candidate.format.trim() || candidate.id,
    formatVersion: candidate.formatVersion?.trim() || null,
    status,
    claimable: status === "verified_savings",
    measurementScope: candidate.measurementScope,
    evidenceType: candidate.evidenceType,
    qualityGate: candidate.qualityGate,
    fidelityGate: candidate.fidelityGate,
    sampleSize,
    baselinePayloadTokens,
    encodedPayloadTokens,
    payloadSavingsTokens,
    payloadSavingsPct,
    baselineSessionTokens,
    candidateSessionTokens,
    formatInstructionTokens,
    decodeRepairTokens,
    retryTokens,
    netCandidateSessionTokens,
    measuredSessionSavingsTokens,
    measuredSessionSavingsPct,
    requiredFields,
    preservedFields,
    missingFields,
    evidenceSource: candidate.evidenceSource?.trim() || null,
    verificationRequired: requirementFor(status, missingFields, minimumSampleSize),
  };
}
