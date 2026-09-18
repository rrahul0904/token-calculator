import { describe, expect, it } from "vitest";
import {
  createGatewayRuntimeMeter,
  markProviderRound,
  remainingRuntimeTimeoutMs,
  snapshotGatewayRuntime,
  utf8ResultBytes,
} from "@/lib/gateway/runtime-budget";

describe("gateway runtime budget meter", () => {
  it("tracks elapsed wall clock and actual provider rounds", () => {
    const meter = createGatewayRuntimeMeter(1_000);
    expect(snapshotGatewayRuntime(meter, 1_250)).toEqual({ elapsedMs: 250, providerRounds: 0, resultBytes: 0 });
    markProviderRound(meter);
    markProviderRound(meter);
    expect(snapshotGatewayRuntime(meter, 1_500)).toEqual({ elapsedMs: 500, providerRounds: 2, resultBytes: 0 });
  });

  it("caps a non-streaming provider timeout to the remaining wall-clock budget", () => {
    expect(remainingRuntimeTimeoutMs(undefined, 10_000)).toBe(120_000);
    expect(remainingRuntimeTimeoutMs(30_000, 12_000)).toBe(18_000);
    expect(remainingRuntimeTimeoutMs(500_000, 12_000)).toBe(120_000);
    expect(remainingRuntimeTimeoutMs(10_000, 10_000)).toBe(1);
  });

  it("measures UTF-8 result bytes instead of JavaScript string length", () => {
    expect(utf8ResultBytes("hello")).toBe(5);
    expect(utf8ResultBytes("é")).toBe(2);
    expect(snapshotGatewayRuntime(createGatewayRuntimeMeter(0), 0, utf8ResultBytes("é"))).toMatchObject({ resultBytes: 2 });
  });
});
