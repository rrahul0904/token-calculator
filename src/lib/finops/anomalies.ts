export type AnomalyConfidence = "low" | "medium" | "high";

export interface MetricObservation {
  periodStart: Date;
  periodEnd: Date;
  value: number;
}

export interface DetectedAnomaly {
  metric: string;
  scopeType: string;
  scopeId: string | null;
  periodStart: Date;
  periodEnd: Date;
  baseline: number;
  observed: number;
  delta: number;
  threshold: number;
  confidence: AnomalyConfidence;
  method: "rolling_median_mad";
  sampleSize: number;
  robustZScore: number | null;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mad(values: number[], center: number) {
  return median(values.map((value) => Math.abs(value - center)));
}

export function detectLatestAnomaly(args: {
  metric: string;
  scopeType: string;
  scopeId?: string | null;
  observations: MetricObservation[];
  minimumSamples?: number;
  robustZThreshold?: number;
  minimumRelativeChange?: number;
  minimumAbsoluteChange?: number;
}): DetectedAnomaly | null {
  const minimumSamples = args.minimumSamples ?? 7;
  if (args.observations.length < minimumSamples + 1) return null;
  const ordered = [...args.observations].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  const current = ordered.at(-1)!;
  const history = ordered.slice(0, -1).slice(-28).map((item) => item.value);
  if (history.length < minimumSamples || history.some((value) => !Number.isFinite(value)) || !Number.isFinite(current.value)) return null;
  const baseline = median(history);
  const deviation = mad(history, baseline);
  const delta = current.value - baseline;
  const relative = baseline === 0 ? (current.value === 0 ? 0 : Number.POSITIVE_INFINITY) : Math.abs(delta) / Math.abs(baseline);
  const minimumRelativeChange = args.minimumRelativeChange ?? 0.35;
  const minimumAbsoluteChange = args.minimumAbsoluteChange ?? 0;
  if (Math.abs(delta) < minimumAbsoluteChange || relative < minimumRelativeChange) return null;

  const robustZ = deviation > 0 ? 0.6745 * delta / deviation : null;
  const threshold = args.robustZThreshold ?? 3.5;
  const statisticallyLarge = robustZ === null ? Math.abs(delta) >= Math.max(Math.abs(baseline), minimumAbsoluteChange) : Math.abs(robustZ) >= threshold;
  if (!statisticallyLarge) return null;
  const sampleSize = history.length;
  const confidence: AnomalyConfidence = sampleSize >= 21 && (robustZ === null || Math.abs(robustZ) >= threshold * 1.5) ? "high" : sampleSize >= 10 ? "medium" : "low";
  return {
    metric: args.metric,
    scopeType: args.scopeType,
    scopeId: args.scopeId ?? null,
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    baseline,
    observed: current.value,
    delta,
    threshold,
    confidence,
    method: "rolling_median_mad",
    sampleSize,
    robustZScore: robustZ,
  };
}

export const FINOPS_ANOMALY_METRICS = [
  "daily_spend_usd",
  "provider_spend_usd",
  "model_spend_usd",
  "project_spend_usd",
  "api_key_spend_usd",
  "retry_count",
  "failed_aborted_spend_usd",
  "fallback_premium_usd",
  "cache_efficiency_pct",
  "cost_per_success_usd",
] as const;
