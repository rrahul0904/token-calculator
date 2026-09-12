import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const projectId = "prj_ADoR3dW8VcpJOaQcagZXOpioyM7l";

async function workflow(name: string) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
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

  it("pins Preview runtime to the persistent validation database", async () => {
    const source = await workflow("release-preview.yml");
    expect(source).toContain("env run -e preview");
    expect(source).toContain('--env "DATABASE_URL=$DATABASE_URL"');
    expect(source).toContain("TOKEN_INTELLIGENCE_EXPECTED_NEON_PROJECT_ID=restless-queen-06517393");
    expect(source).toContain("TOKEN_INTELLIGENCE_EXPECTED_NEON_BRANCH_ID=br-small-haze-aeqj7d25");
  });

  it("uses masked ephemeral WorkOS users instead of long-lived release-user secrets", async () => {
    const preview = await workflow("release-preview.yml");
    const production = await workflow("release-production.yml");
    const provisioner = await source("scripts/release/workos-release-users.ts");

    expect(preview).toContain("Provision ephemeral WorkOS Staging certification users");
    expect(preview).toContain("Delete ephemeral WorkOS Staging certification users");
    expect(preview).toContain("steps.release_users.outputs.auth_email");
    expect(preview).toContain("steps.release_users.outputs.onboarding_email");
    expect(preview).not.toContain("secrets.RELEASE_AUTH_EMAIL");
    expect(preview).not.toContain("secrets.RELEASE_AUTH_PASSWORD");
    expect(preview).not.toContain("secrets.RELEASE_ONBOARDING_AUTH_EMAIL");
    expect(preview).not.toContain("secrets.RELEASE_ONBOARDING_AUTH_PASSWORD");

    expect(production).toContain("Provision ephemeral WorkOS Production certification user");
    expect(production).toContain("--profile=auth-only");
    expect(production).toContain("Delete ephemeral WorkOS Production certification user");
    expect(production).toContain("steps.release_user.outputs.auth_email");
    expect(production).not.toContain("secrets.RELEASE_AUTH_EMAIL");
    expect(production).not.toContain("secrets.RELEASE_AUTH_PASSWORD");

    expect(provisioner).toContain("::add-mask::");
    expect(provisioner).toContain("credentialsPersisted: false");
    expect(provisioner).toContain('method: "DELETE"');
    expect(provisioner).toContain("GITHUB_OUTPUT");
  });

  it("certifies a staged Production artifact and promotes that exact deployment without rebuilding", async () => {
    const source = await workflow("release-production.yml");
    expect(source).toContain("download-artifact");
    expect(source).toContain("release:verify:manifest");
    expect(source).toContain("vercel@59.11.7 build --prod");
    expect(source).toContain("deploy --prebuilt --prod --skip-domain");
    expect(source).toContain('promote "${{ steps.staged.outputs.url }}"');
    expect(source).toContain('steps.staged_identity.outputs.deployment_id');
    expect(source).toContain('--env "DATABASE_URL=$DATABASE_URL"');
    expect(source).toContain("TOKEN_INTELLIGENCE_EXPECTED_NEON_BRANCH_ID=br-muddy-sun-aeyodc4h");

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

  it("requires the deployed runtime to prove the actual Neon identity", async () => {
    const health = await source("src/app/api/health/route.ts");
    const verifier = await source("scripts/release/verify-deployment.ts");

    expect(health).toContain("current_setting('neon.project_id', true)");
    expect(health).toContain("current_setting('neon.branch_id', true)");
    expect(health).toContain("TOKEN_INTELLIGENCE_EXPECTED_NEON_PROJECT_ID");
    expect(health).toContain("TOKEN_INTELLIGENCE_EXPECTED_NEON_BRANCH_ID");
    expect(verifier).toContain('health.databaseIdentity !== "verified"');
    expect(verifier).toContain("DATABASE_IDENTITY_NOT_VERIFIED");
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