import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const projectId = "prj_ADoR3dW8VcpJOaQcagZXOpioyM7l";

async function workflow(name: string) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

describe("release workflow invariants", () => {
  it("deploys an exact-SHA prebuilt Preview to the existing Vercel project", async () => {
    const source = await workflow("release-preview.yml");
    expect(source).toContain("ref: ${{ needs.preflight.outputs.sha }}");
    expect(source).toContain("TARGET_SHA: ${{ needs.preflight.outputs.sha }}");
    expect(source).toContain(projectId);
    expect(source).toContain("deploy --prebuilt");
    expect(source).toContain("release:verify:deployment");
    expect(source).toContain("release-manifest");
  });

  it("certifies a staged Production artifact and promotes that exact deployment without rebuilding", async () => {
    const source = await workflow("release-production.yml");
    expect(source).toContain("download-artifact");
    expect(source).toContain("release:verify:manifest");
    expect(source).toContain("vercel@59.11.7 build --prod");
    expect(source).toContain("deploy --prebuilt --prod --skip-domain");
    expect(source).toContain('promote "${{ steps.staged.outputs.url }}"');
    expect(source).toContain('steps.staged_identity.outputs.deployment_id');

    const build = source.indexOf("vercel@59.11.7 build --prod");
    const stagedDeploy = source.indexOf("deploy --prebuilt --prod --skip-domain");
    const stagedCertification = source.indexOf("Certify staged Production runtime before traffic");
    const promote = source.indexOf('promote "${{ steps.staged.outputs.url }}"');
    expect(build).toBeGreaterThan(-1);
    expect(stagedDeploy).toBeGreaterThan(build);
    expect(stagedCertification).toBeGreaterThan(stagedDeploy);
    expect(promote).toBeGreaterThan(stagedCertification);
    expect(source.lastIndexOf("vercel@59.11.7 build --prod")).toBeLessThan(promote);
    expect(source).not.toContain('promote "${{ steps.manifest.outputs.preview_url }}"');
  });

  it("rolls back to an exact prior Production deployment through Vercel rollback and never touches the database", async () => {
    const source = await workflow("release-rollback.yml");
    expect(source).toContain("/v1/projects/$VERCEL_PROJECT_ID/rollback/");
    expect(source).toContain("release:vercel:deployment");
    expect(source).toContain("--expect-id");
    expect(source).toContain("expected_sha");
    expect(source).not.toContain("vercel@59.11.7 promote");
    expect(source).not.toContain("db:migrate");
    expect(source).not.toContain("DATABASE_URL");

    const production = await workflow("release-production.yml");
    expect(production).toContain("/v1/projects/$VERCEL_PROJECT_ID/rollback/");
    expect(production).toContain("steps.previous.outputs.id");
  });

  it("creates a GitHub release only after the certified SHA is on main", async () => {
    const source = await workflow("release-finalize.yml");
    expect(source).toContain("git merge-base --is-ancestor");
    expect(source).toContain("release:verify:deployment");
    expect(source).toContain("gh release create");
  });
});
