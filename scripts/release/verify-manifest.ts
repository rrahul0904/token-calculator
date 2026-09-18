import { readFile } from "node:fs/promises";
import process from "node:process";
import { releaseMigrationInventory } from "./migration-inventory";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const path = argument("file") ?? "release-evidence/release-manifest.json";
const expectedSha = argument("sha");
const expectedStatus = argument("status") ?? "preview_certified";
const manifest = JSON.parse(await readFile(path, "utf8")) as {
  schemaVersion?: number;
  application?: string;
  version?: string;
  gitSha?: string;
  gitBranch?: string;
  status?: string;
  vercelPreviewUrl?: string | null;
  productionUrl?: string | null;
  vercelDeploymentId?: string | null;
  migrationCount?: number;
  migrationRange?: [string, string];
  migrationFiles?: string[];
  workosEnvironment?: string;
  neonProjectId?: string;
  neonBranch?: string;
  stripeAccount?: string;
};
const migrationInventory = await releaseMigrationInventory();
const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version?: string };
const production = expectedStatus === "production_certified";
const expectedWorkosEnvironment = production
  ? "environment_01M1G0NZHV4J3CNS2WQZB2JER4"
  : "environment_01M1G0NYZ6EX1MR9Z51Y7VZ15X";
const expectedNeonBranch = production ? "main" : "release-validation-full-site";

const checks = {
  schemaVersion: manifest.schemaVersion === 2,
  application: manifest.application === "token-intelligence",
  version: Boolean(packageJson.version && manifest.version === packageJson.version),
  gitBranch: manifest.gitBranch === "release-candidate-full-site",
  sha: Boolean(expectedSha && manifest.gitSha === expectedSha),
  status: manifest.status === expectedStatus,
  previewUrl: !["preview_certified", "production_certified"].includes(expectedStatus) || Boolean(manifest.vercelPreviewUrl),
  productionUrl: expectedStatus !== "production_certified" || Boolean(manifest.productionUrl),
  deploymentId: !["preview_certified", "production_certified"].includes(expectedStatus) || Boolean(manifest.vercelDeploymentId),
  migrationCount: manifest.migrationCount === migrationInventory.count,
  migrationRange: JSON.stringify(manifest.migrationRange) === JSON.stringify(migrationInventory.range),
  migrationFiles: JSON.stringify(manifest.migrationFiles) === JSON.stringify(migrationInventory.files),
  workosEnvironment: manifest.workosEnvironment === expectedWorkosEnvironment,
  neonProject: manifest.neonProjectId === "restless-queen-06517393",
  neonBranch: manifest.neonBranch === expectedNeonBranch,
  stripeAccount: manifest.stripeAccount === "acct_1QrNa7RB8OGmEnBw",
};
process.stdout.write(JSON.stringify({
  path,
  checks,
  manifest: {
    schemaVersion: manifest.schemaVersion,
    application: manifest.application,
    version: manifest.version,
    gitBranch: manifest.gitBranch,
    gitSha: manifest.gitSha,
    status: manifest.status,
    vercelPreviewUrl: manifest.vercelPreviewUrl,
    productionUrl: manifest.productionUrl,
    vercelDeploymentId: manifest.vercelDeploymentId,
    migrationCount: manifest.migrationCount,
    migrationRange: manifest.migrationRange,
    workosEnvironment: manifest.workosEnvironment,
    neonProjectId: manifest.neonProjectId,
    neonBranch: manifest.neonBranch,
    stripeAccount: manifest.stripeAccount,
  },
}, null, 2) + "\n");
if (!Object.values(checks).every(Boolean)) process.exitCode = 2;
