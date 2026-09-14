import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string, fallback?: string) {
  const value = argument(name) ?? fallback;
  if (!value) throw new Error(`MISSING_MANIFEST_FIELD:${name}`);
  return value;
}

const status = required("status");
const output = resolve(argument("output") ?? "release-evidence/release-manifest.json");
const manifest = {
  schemaVersion: 1,
  application: "token-intelligence",
  version: process.env.npm_package_version ?? "0.3.0",
  gitSha: required("sha", process.env.GITHUB_SHA),
  gitBranch: argument("branch") ?? process.env.GITHUB_REF_NAME ?? "release-candidate-full-site",
  githubRunId: argument("run-id") ?? process.env.GITHUB_RUN_ID ?? null,
  githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  vercelDeploymentId: argument("deployment-id") ?? null,
  vercelPreviewUrl: argument("preview-url") ?? null,
  stagedProductionUrl: argument("staged-production-url") ?? null,
  productionUrl: argument("production-url") ?? null,
  neonProjectId: "restless-queen-06517393",
  neonBranch: argument("neon-branch") ?? (status === "production_certified" ? "main" : "release-validation-full-site"),
  migrationCount: 8,
  migrationRange: ["0000", "0007"],
  workosEnvironment: "environment_01M1G0NZHV4J3CNS2WQZB2JER4",
  stripeAccount: "acct_1QrNa7RB8OGmEnBw",
  certifiedAt: new Date().toISOString(),
  status,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(manifest, null, 2) + "\n", "utf8");
process.stdout.write(JSON.stringify({ written: output, status: manifest.status, gitSha: manifest.gitSha }, null, 2) + "\n");
