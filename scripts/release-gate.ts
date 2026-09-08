import { spawnSync } from "node:child_process";
import process from "node:process";

type Check = {
  name: string;
  command: string;
  args: string[];
  provider?: boolean;
};

const strictProviders = process.argv.includes("--require-production-providers");
const checks: Check[] = [
  { name: "lint", command: "npm", args: ["run", "lint"] },
  { name: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { name: "unit tests", command: "npm", args: ["test"] },
  { name: "pricing", command: "npm", args: ["run", "pricing:diff"] },
  { name: "schema", command: "npm", args: ["run", "db:check"] },
  { name: "migrations", command: "npm", args: ["run", "db:migrate"] },
  { name: "database verification", command: "npm", args: ["run", "db:verify"] },
  { name: "database integration", command: "npm", args: ["run", "test:integration"] },
  { name: "SDK", command: "npm", args: ["run", "sdk:build"] },
  { name: "CLI", command: "npm", args: ["run", "ti", "--", "--help"] },
  { name: "production build", command: "npm", args: ["run", "build"] },
  {
    name: "provider preflight",
    command: "npm",
    args: ["run", "providers:verify", "--", "--scope=production", ...(strictProviders ? ["--require"] : [])],
    provider: true,
  },
];

let failed = false;
for (const check of checks) {
  process.stdout.write(`\n== release gate: ${check.name} ==\n`);
  const env = { ...process.env };
  if (check.name === "database integration") env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS = "1";
  const result = spawnSync(check.command, check.args, { stdio: "inherit", env });
  const status = result.status ?? 1;
  if (status !== 0) {
    if (check.provider && !strictProviders) {
      process.stdout.write("Provider preflight is not certified in this environment; repository gate continues with explicit external blocker evidence.\n");
      continue;
    }
    failed = true;
    process.stderr.write(`FAILED: ${check.name}\n`);
    break;
  }
}

process.exitCode = failed ? 1 : 0;
