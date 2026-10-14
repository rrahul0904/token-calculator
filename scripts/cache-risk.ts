#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { getCollector } from "@/lib/collectors/registry";
import type { CollectorName } from "@/lib/collectors/types";
import {
  DEFAULT_SESSION_CACHE_RISK_POLICY,
  deriveSessionCacheRiskFromCollector,
  formatSessionCacheRiskReport,
  type SessionCacheRiskPolicy,
} from "@/lib/optimization/session-cache-risk";

const COLLECTORS = new Set<CollectorName>(["codex", "claude", "cursor", "antigravity"]);

function value(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

function optionalThreshold(args: string[], name: string, fallback: number | null) {
  const raw = value(args, name);
  if (raw === undefined) return fallback;
  if (["none", "off", "null"].includes(raw.toLowerCase())) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number or 'none'`);
  return parsed;
}

function numberValue(args: string[], name: string, fallback: number) {
  const raw = value(args, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number`);
  return parsed;
}

function usage() {
  process.stdout.write(`Token Intelligence local session cache risk\n\nUsage:\n  npx tsx scripts/cache-risk.ts <codex|claude|cursor|antigravity> FILE [options]\n\nOptions:\n  --now ISO                 Inject a deterministic clock (default: current time)\n  --warning-minutes N       Warning lead before an evidence-backed expiry (default: 5)\n  --min-context N|none      Quiet below this observed input-side context (default: 50000)\n  --min-cost N|none         Quiet below this observed cost signal (default: 0.50)\n  --json                    Emit the machine-readable report\n  --help                    Show this help\n\nBehavior:\n  - local file read only; no API key and no network request\n  - prompt/code/transcript content is never emitted\n  - a cache deadline is reported only when normalized metadata contains a defensible TTL class and interaction anchor\n  - mixed or unsupported TTL evidence returns 'unknown' instead of inventing a timer\n  - recommendations are advisory only; this command never sends a keepalive or modifies a provider session\n`);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help") || args.includes("-h")) return usage();

  const collectorName = args[0] as CollectorName;
  const file = args[1];
  if (!COLLECTORS.has(collectorName)) throw new Error(`Unsupported collector '${args[0] ?? ""}'`);
  if (!file || file.startsWith("--")) throw new Error("A local provider history FILE is required");

  const collector = getCollector(collectorName);
  if (!collector) throw new Error(`Collector '${collectorName}' is not registered`);
  const text = await readFile(resolve(file), "utf8");
  const parsed = collector.parseJsonLines(text.split(/\r?\n/), { environment: "local-cache-risk" });

  const warningMinutes = numberValue(args, "--warning-minutes", DEFAULT_SESSION_CACHE_RISK_POLICY.warningLeadSeconds / 60);
  const policy: Partial<SessionCacheRiskPolicy> = {
    warningLeadSeconds: Math.round(warningMinutes * 60),
    minContextTokens: optionalThreshold(args, "--min-context", DEFAULT_SESSION_CACHE_RISK_POLICY.minContextTokens),
    minCostUsd: optionalThreshold(args, "--min-cost", DEFAULT_SESSION_CACHE_RISK_POLICY.minCostUsd),
  };
  const nowRaw = value(args, "--now");
  if (nowRaw && Number.isNaN(new Date(nowRaw).getTime())) throw new Error("--now must be a valid ISO date/time");

  const report = deriveSessionCacheRiskFromCollector(parsed, { now: nowRaw ?? new Date(), policy });
  if (args.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(formatSessionCacheRiskReport(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
