import { spawnSync } from "node:child_process";

type Check = { name: string; command: string; args: string[]; required: boolean };

const checks: Check[] = [
  { name: "release configuration", command: "npm", args: ["run", "release:config", "--", "--require-production"], required: true },
  { name: "lint", command: "npm", args: ["run", "lint"], required: true },
  { name: "typecheck", command: "npm", args: ["run", "typecheck"], required: true },
  { name: "unit tests", command: "npm", args: ["test"], required: true },
  { name: "pricing self-check", command: "npm", args: ["run", "pricing:diff"], required: true },
  { name: "schema check", command: "npm", args: ["run", "db:check"], required: true },
  { name: "database verify", command: "npm", args: ["run", "db:verify"], required: true },
  { name: "SDK build", command: "npm", args: ["run", "sdk:build"], required: true },
  { name: "production build", command: "npm", args: ["run", "build"], required: true },
];

let failed = false;
for (const check of checks) {
  process.stdout.write("\n== " + check.name + " ==\n");
  const result = spawnSync(check.command, check.args, { stdio: "inherit", env: process.env });
  if (result.status !== 0 && check.required) {
    failed = true;
    process.stderr.write("FAILED: " + check.name + "\n");
    break;
  }
}
process.exitCode = failed ? 1 : 0;
