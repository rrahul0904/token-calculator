import { spawnSync } from "node:child_process";
import process from "node:process";

type Check = {
  name: string;
  command: string;
  args: string[];
  provider?: boolean;
};

const strictProviders = process.argv.includes("--require-production-providers");

function databaseIsExplicitlyDisposable() {
  if (process.env.TOKEN_INTELLIGENCE_RELEASE_DISPOSABLE_DATABASE === "1") return true;
  const raw = process.env.DATABASE_URL;
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

const checks: Check[] = [
  { name: "secret policy", command: "npm", args: ["run", "secret:policy"] },
  { name: "lint", command: "npm", args: ["run", "lint"] },
  { name: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { name: "unit tests", command: "npm", args: ["test"] },
  { name: "pricing", command: "npm", args: ["run", "pricing:diff"] },
  { name: "schema", command: "npm", args: ["run", "db:check"] },
  { name: "migrations", command: "npm", args: ["run", "db:migrate"] },
  { name: "database verification", command: "npm", args: ["run", "db:verify"] },
  { name: "database integration", command: "npm", args: ["run", "test:integration"] },
  { name: "authenticated E2E seed", command: "npx", args: ["tsx", "scripts/seed-e2e.ts"] },
  { name: "admin rollup first pass", command: "npm", args: ["run", "admin:rollup"] },
  { name: "admin rollup idempotency pass", command: "npm", args: ["run", "admin:rollup"] },
  { name: "TypeScript SDK", command: "npm", args: ["run", "sdk:build"] },
  { name: "Python SDK", command: "python3", args: ["-c", "from token_intelligence import TokenIntelligenceClient, TokenIntelligenceError; assert TokenIntelligenceClient and TokenIntelligenceError"] },
  { name: "CLI", command: "npm", args: ["run", "ti", "--", "--help"] },
  { name: "production build", command: "npm", args: ["run", "build"] },
  { name: "browser matrix", command: "npm", args: ["run", "test:e2e"] },
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
  if (check.name === "migrations" && !databaseIsExplicitlyDisposable()) {
    process.stderr.write("FAILED: migration application requires TOKEN_INTELLIGENCE_RELEASE_DISPOSABLE_DATABASE=1 or a loopback DATABASE_URL.\n");
    failed = true;
    break;
  }
  const env = { ...process.env };
  if (check.name === "database integration") env.TOKEN_INTELLIGENCE_INTEGRATION_TESTS = "1";
  if (check.name === "authenticated E2E seed") env.TOKEN_INTELLIGENCE_E2E_SEED = "1";
  if (check.name === "Python SDK") env.PYTHONPATH = "packages/sdk-python";
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
