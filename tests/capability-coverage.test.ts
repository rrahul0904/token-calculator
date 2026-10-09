import { describe, expect, it } from "vitest";

import {
  buildCapabilityCoverageReport,
  NATIVE_EVALUATOR_BY_TECHNIQUE,
} from "@/lib/optimization/capability-coverage";
import { TOKEN_SAVING_DONORS } from "@/lib/optimization/token-saving-portfolio";

describe("token-saving donor capability coverage", () => {
  it("maps every enrolled donor to an owned clean-room evaluator", () => {
    const report = buildCapabilityCoverageReport();

    expect(report.donorCount).toBe(TOKEN_SAVING_DONORS.length);
    expect(report.donorCount).toBe(50);
    expect(report.complete).toBe(true);
    expect(report.uncoveredDonorIds).toEqual([]);
    expect(report.donors).toHaveLength(TOKEN_SAVING_DONORS.length);
  });

  it("covers every registered technique with one native evaluator family", () => {
    const report = buildCapabilityCoverageReport();
    const registeredTechniques = [...new Set(TOKEN_SAVING_DONORS.map((donor) => donor.technique))].sort();

    expect(report.coveredTechniques).toEqual(registeredTechniques);
    expect(report.techniqueCount).toBe(11);
    expect(report.evaluatorCount).toBe(11);
    expect(Object.keys(NATIVE_EVALUATOR_BY_TECHNIQUE).sort()).toEqual(registeredTechniques);
  });

  it("keeps behavior minimalism and cost controls behind explicit owned boundaries", () => {
    expect(NATIVE_EVALUATOR_BY_TECHNIQUE.behavior_minimalism).toBe("response_density");
    expect(NATIVE_EVALUATOR_BY_TECHNIQUE.prompt_cache_optimization).toBe("prompt_cache_economics");
    expect(NATIVE_EVALUATOR_BY_TECHNIQUE.budget_control).toBe("budget_control");
    expect(NATIVE_EVALUATOR_BY_TECHNIQUE.agent_orchestration).toBe("orchestration_efficiency");
  });
});
