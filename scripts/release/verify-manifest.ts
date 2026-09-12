import { readFile } from "node:fs/promises";
import process from "node:process";

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
  gitSha?: string;
  status?: string;
  vercelPreviewUrl?: string | null;
  productionUrl?: string | null;
  vercelDeploymentId?: string | null;
};

const checks = {
  sha: Boolean(expectedSha && manifest.gitSha === expectedSha),
  status: manifest.status === expectedStatus,
  previewUrl: !["preview_certified", "production_certified"].includes(expectedStatus) || Boolean(manifest.vercelPreviewUrl),
  productionUrl: expectedStatus !== "production_certified" || Boolean(manifest.productionUrl),
  deploymentId: !["preview_certified", "production_certified"].includes(expectedStatus) || Boolean(manifest.vercelDeploymentId),
};
process.stdout.write(JSON.stringify({
  path,
  checks,
  manifest: {
    gitSha: manifest.gitSha,
    status: manifest.status,
    vercelPreviewUrl: manifest.vercelPreviewUrl,
    productionUrl: manifest.productionUrl,
    vercelDeploymentId: manifest.vercelDeploymentId,
  },
}, null, 2) + "\n");
if (!Object.values(checks).every(Boolean)) process.exitCode = 2;
