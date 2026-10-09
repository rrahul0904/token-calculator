import { describe, expect, it } from "vitest";

import {
  REVERSE_ENGINEERING_AGENT_SPECS,
  buildDonorAgentAssignments,
} from "@/lib/optimization/reverse-engineering-agents";
import {
  MANDATORY_REVERSE_ENGINEERING_STAGES,
  TOKEN_SAVING_DONORS,
} from "@/lib/optimization/token-saving-portfolio";

describe("reverse engineering agent contracts", () => {
  it("keeps product write authority bounded to the implementation worker", () => {
    const writers = REVERSE_ENGINEERING_AGENT_SPECS.filter((agent) => agent.mayWriteProductCode);
    expect(writers.map((agent) => agent.role)).toEqual(["implementation_worker"]);
    expect(REVERSE_ENGINEERING_AGENT_SPECS.every((agent) => agent.maySelfApprove === false)).toBe(true);
  });

  it("assigns every roadmap stage and never lets the implementation worker self-review", () => {
    const donor = TOKEN_SAVING_DONORS[0];
    const assignments = buildDonorAgentAssignments(donor, MANDATORY_REVERSE_ENGINEERING_STAGES);

    expect(assignments).toHaveLength(13);
    expect(assignments.map((assignment) => assignment.stage)).toEqual(MANDATORY_REVERSE_ENGINEERING_STAGES);

    const implementation = assignments.find((assignment) => assignment.stage === "clean_room_implementation");
    expect(implementation?.owner).toBe("implementation_worker");
    expect(implementation?.writeAccess).toBe("bounded_product_slice");
    expect(implementation?.reviewers).not.toContain("implementation_worker");
  });

  it("gives independent verification to a non-writing role", () => {
    const donor = TOKEN_SAVING_DONORS[0];
    const assignments = buildDonorAgentAssignments(donor, MANDATORY_REVERSE_ENGINEERING_STAGES);
    const verification = assignments.find((assignment) => assignment.stage === "independent_verification");
    const verifier = REVERSE_ENGINEERING_AGENT_SPECS.find((agent) => agent.role === verification?.owner);

    expect(verification?.owner).toBe("independent_verifier");
    expect(verifier?.mayWriteProductCode).toBe(false);
    expect(verification?.completionRequiresEvidence).toBe(true);
  });
});
