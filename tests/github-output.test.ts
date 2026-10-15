import { describe, expect, it } from "vitest";
import { escapeGithubCommandData, formatGithubOutputs, resolveGithubOutputPath } from "../scripts/release/github-output";

describe("GitHub Actions output encoding", () => {
  it("uses a generated multiline delimiter for values containing newlines", () => {
    const output = formatGithubOutputs({ auth_user_id: "user_123\nrelease_password=attacker-value" });
    const match = output.match(/^auth_user_id<<([^\n]+)\n([\s\S]*)\n\1\n$/);
    expect(match).not.toBeNull();
    expect(match?.[2]).toBe("user_123\nrelease_password=attacker-value");
  });

  it("rejects output names that could alter the action contract", () => {
    expect(() => formatGithubOutputs({ "auth_user_id\nother": "value" })).toThrow("INVALID_GITHUB_OUTPUT_NAME");
  });

  it("restricts output writes to the GitHub runner temporary directory", () => {
    expect(resolveGithubOutputPath("/runner/_temp/output", "/runner/_temp")).toBe("/runner/_temp/output");
    expect(() => resolveGithubOutputPath("/runner/work/repo/output", "/runner/_temp")).toThrow("GITHUB_OUTPUT_PATH_OUTSIDE_RUNNER_TEMP");
  });

  it("escapes data before it enters the GitHub workflow-command protocol", () => {
    expect(escapeGithubCommandData("user%_1\r\n::stop-commands::x")).toBe("user%25_1%0D%0A::stop-commands::x");
  });
});
