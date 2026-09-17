import { describe, expect, it } from "vitest";
import { detectLatestAnomaly } from "@/lib/finops/anomalies";

function day(index: number, value: number) {
  const start = new Date(Date.UTC(2026, 7, index + 1));
  return { periodStart: start, periodEnd: new Date(start.getTime() + 86_400_000), value };
}

describe("FinOps anomaly detection", () => {
  it("detects a material spend spike with baseline evidence", () => {
    const observations = [...Array.from({ length: 14 }, (_, i) => day(i, 10 + (i % 3))), day(14, 80)];
    const anomaly = detectLatestAnomaly({ metric: "daily_spend_usd", scopeType: "organization", observations, minimumAbsoluteChange: 5 });
    expect(anomaly).not.toBeNull();
    expect(anomaly?.observed).toBe(80);
    expect(anomaly?.baseline).toBeGreaterThanOrEqual(10);
    expect(anomaly?.method).toBe("rolling_median_mad");
  });

  it("does not fire without enough history", () => {
    const anomaly = detectLatestAnomaly({ metric: "daily_spend_usd", scopeType: "organization", observations: [day(0, 1), day(1, 100)] });
    expect(anomaly).toBeNull();
  });

  it("does not fire on ordinary noise", () => {
    const observations = Array.from({ length: 12 }, (_, i) => day(i, 100 + (i % 4) * 2));
    observations.push(day(12, 108));
    expect(detectLatestAnomaly({ metric: "provider_spend_usd", scopeType: "provider", scopeId: "openai", observations })).toBeNull();
  });

  it("supports negative regressions such as cache efficiency degradation", () => {
    const observations = [...Array.from({ length: 10 }, (_, i) => day(i, 80 + (i % 2))), day(10, 25)];
    const anomaly = detectLatestAnomaly({ metric: "cache_efficiency_pct", scopeType: "project", scopeId: "p1", observations, minimumAbsoluteChange: 10 });
    expect(anomaly?.delta).toBeLessThan(0);
  });
});
