import { spawnSync } from "node:child_process";
import process from "node:process";

const strict = process.argv.includes("--require");
const scopeArg = process.argv.find((value) => value.startsWith("--scope="))
  ?? `--scope=${process.env.RELEASE_SCOPE ?? "production"}`;
const baseUrlArg = process.argv.find((value) => value.startsWith("--base-url="));
const commands = [
  ["workos", ["tsx", "scripts/release/workos-verify.ts", scopeArg, ...(baseUrlArg ? [baseUrlArg] : []), ...(strict ? ["--require"] : [])]],
  ["stripe", ["tsx", "scripts/release/stripe-verify.ts", ...(strict ? ["--require"] : [])]],
  ["mcp", ["tsx", "scripts/release/mcp-verify.ts", ...(baseUrlArg ? [baseUrlArg] : []), ...(strict ? ["--require"] : [])]],
] as const;

let failed = false;
for (const [name, args] of commands) {
  process.stdout.write(`\n== provider: ${name} ==\n`);
  const result = spawnSync("npx", ["--no-install", ...args], { stdio: "inherit", env: process.env });
  if ((result.status ?? 1) !== 0) failed = true;
}
if (failed) process.exitCode = 2;
