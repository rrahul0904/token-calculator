import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const tracked = spawnSync("git", ["ls-files"], { encoding: "utf8" });
if (tracked.status !== 0) throw new Error("GIT_LS_FILES_FAILED");

const files = tracked.stdout.split(/\r?\n/).filter(Boolean);
const forbidden = files.filter((path) => {
  if (path === ".env.example") return false;
  if (/^\.env(?:\.|$)/.test(path)) return true;
  if (path === ".vercel/project.json" || path.startsWith(".vercel/output/")) return true;
  if (/release-evidence\/.+secret/i.test(path)) return true;
  return false;
});

const checks = {
  gitleaksConfig: existsSync(".gitleaks.toml"),
  noTrackedRuntimeEnvFiles: forbidden.length === 0,
  forbiddenTrackedPaths: forbidden,
};

process.stdout.write(JSON.stringify(checks, null, 2) + "\n");
if (!checks.gitleaksConfig || !checks.noTrackedRuntimeEnvFiles) process.exitCode = 2;
