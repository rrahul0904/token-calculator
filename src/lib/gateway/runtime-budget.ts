export interface GatewayRuntimeMeter {
  startedAtMs: number;
  providerRounds: number;
}

export interface GatewayRuntimeSnapshot {
  elapsedMs: number;
  providerRounds: number;
  resultBytes: number;
}

export function createGatewayRuntimeMeter(startedAtMs = Date.now()): GatewayRuntimeMeter {
  return { startedAtMs, providerRounds: 0 };
}

export function markProviderRound(meter: GatewayRuntimeMeter): number {
  meter.providerRounds += 1;
  return meter.providerRounds;
}

export function snapshotGatewayRuntime(
  meter: GatewayRuntimeMeter,
  nowMs = Date.now(),
  resultBytes = 0,
): GatewayRuntimeSnapshot {
  return {
    elapsedMs: Math.max(0, nowMs - meter.startedAtMs),
    providerRounds: meter.providerRounds,
    resultBytes: Math.max(0, Math.trunc(resultBytes)),
  };
}

export function remainingRuntimeTimeoutMs(
  maxElapsedMs: number | undefined,
  elapsedMs: number,
  defaultTimeoutMs = 120_000,
): number {
  if (maxElapsedMs === undefined) return defaultTimeoutMs;
  return Math.max(1, Math.min(defaultTimeoutMs, maxElapsedMs - elapsedMs));
}

export function utf8ResultBytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
