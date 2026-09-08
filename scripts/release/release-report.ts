import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const manifestPath = resolve(argument("manifest") ?? "release-evidence/release-manifest.json");
const output = resolve(argument("output") ?? "release-evidence/release-report.md");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
const line = (label: string, value: unknown) => `- **${label}:** ${value ?? "not recorded"}`;
const report = [
  "# Token Intelligence Release Evidence",
  "",
  line("Status", manifest.status),
  line("Git SHA", manifest.gitSha),
  line("Git branch", manifest.gitBranch),
  line("GitHub Actions run", manifest.githubRunId),
  line("Vercel deployment", manifest.vercelDeploymentId),
  line("Preview URL", manifest.vercelPreviewUrl),
  line("Production URL", manifest.productionUrl),
  line("Neon project", manifest.neonProjectId),
  line("Neon branch", manifest.neonBranch),
  line("Migration range", Array.isArray(manifest.migrationRange) ? manifest.migrationRange.join(" → ") : null),
  line("WorkOS environment", manifest.workosEnvironment),
  line("Stripe account", manifest.stripeAccount),
  line("Certified at", manifest.certifiedAt),
  "",
  "This report contains release identifiers only. Secret values are intentionally excluded.",
  "",
].join("\n");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, report, "utf8");
process.stdout.write(JSON.stringify({ written: output }, null, 2) + "\n");
