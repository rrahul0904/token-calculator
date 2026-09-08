import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const projectId = "prj_ADoR3dW8VcpJOaQcagZXOpioyM7l";

async function workflow(name: string) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

describe("release workflow invariants", () => {
  it("deploys an exact-SHA prebuilt Preview to the existing Vercel project", async () => {
    const source = await workflow("release-preview.yml");
    expect(source).toContain("ref: ${{ inputs.sha }}");
    expect(source).toContain(projectId);
    expect(source).toContain("deploy --prebuilt");
    expect(source).toContain("release:verify:deployment");
    expect(source).toContain("release-manifest");
  });

  it("promotes the certified Preview artifact without rebuilding Production", async () => {
    const source = await workflow("release-production.yml");
    expect(source).toContain("download-artifact");
    expect(source).toContain("release:verify:manifest");
    expect(source).toContain("vercel@59.11.7 promote");
    expect(source).not.toContain("vercel@59.11.7 build");
    expect(source).not.toMatch(/vercel(?:@\S+)?\s+(?:deploy\s+)?--prod/);
  });

  it("rolls back by re-promoting an exact prior artifact and never touches the database", async () => {
    const source = await workflow("release-rollback.yml");
    expect(source).toContain("vercel@59.11.7 promote");
    expect(source).toContain("expected_sha");
    expect(source).not.toContain("db:migrate");
    expect(source).not.toContain("DATABASE_URL");
  });

  it("creates a GitHub release only after the certified SHA is on main", async () => {
    const source = await workflow("release-finalize.yml");
    expect(source).toContain("git merge-base --is-ancestor");
    expect(source).toContain("release:verify:deployment");
    expect(source).toContain("gh release create");
  });
});
