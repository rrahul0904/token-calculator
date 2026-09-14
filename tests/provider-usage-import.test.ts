import { describe, expect, it } from "vitest";
import { assertImportCommitSafe, previewProviderUsageImport } from "@/lib/imports/provider-usage";

describe("provider usage imports", () => {
  it("previews CSV rows and reports honest run attribution coverage", () => {
    const preview = previewProviderUsageImport("provider,date,cost_usd,run_id,model\nopenai,2026-09-01,2.50,run_1,gpt-x\nopenai,2026-09-01,7.50,,gpt-y\n", { sourceIdentity: "invoice.csv" });
    expect(preview.rowCount).toBe(2);
    expect(preview.totalCostUsd).toBe(10);
    expect(preview.attribution.runAttributedCostUsd).toBe(2.5);
    expect(preview.attribution.unattributedCostUsd).toBe(7.5);
    expect(preview.attribution.runAttributionCoveragePct).toBe(25);
    expect(preview.provenance).toBe("provider_imported");
  });

  it("accepts JSON rows without inventing missing run attribution", () => {
    const preview = previewProviderUsageImport(JSON.stringify([{ provider: "anthropic", date: "2026-09-01", amount_usd: 4.2, total_tokens: 1000 }]), { sourceIdentity: "usage.json" });
    expect(preview.totalCostUsd).toBe(4.2);
    expect(preview.attribution.runAttributedCostUsd).toBe(0);
    expect(preview.attribution.runAttributionCoveragePct).toBe(0);
  });

  it("blocks malformed and duplicate imports before commit", () => {
    const invalid = previewProviderUsageImport("provider,cost_usd\nopenai,1\n", { sourceIdentity: "bad.csv" });
    expect(invalid.errors).toHaveLength(1);
    expect(() => assertImportCommitSafe(invalid, [])).toThrow(/INVALID_ROWS/);

    const valid = previewProviderUsageImport("provider,date,cost_usd\nopenai,2026-09-01,1\n", { sourceIdentity: "good.csv" });
    expect(() => assertImportCommitSafe(valid, [valid.sourceHash])).toThrow(/DUPLICATE_PROVIDER_USAGE_IMPORT/);
  });

  it("handles quoted CSV values deterministically", () => {
    const preview = previewProviderUsageImport('provider,date,cost_usd,project\nopenai,2026-09-01,1.25,"alpha, beta"\n', { sourceIdentity: "quoted.csv" });
    expect(preview.validRows[0].project).toBe("alpha, beta");
  });
});
