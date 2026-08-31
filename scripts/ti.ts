#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { stdin as input, stdout as output } from "node:process";
import { collectorCapabilities, getCollector } from "@/lib/collectors/registry";
import type { CollectorName } from "@/lib/collectors/types";

interface CliConfig { baseUrl?: string; apiKey?: string; projectId?: string; environment?: string }
const CONFIG_PATH = resolve(homedir(), ".config", "token-intelligence", "config.json");

async function readConfig(): Promise<CliConfig> {
  try { return JSON.parse(await readFile(CONFIG_PATH, "utf8")) as CliConfig; } catch { return {}; }
}

async function writeConfig(config: CliConfig) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try { await chmod(CONFIG_PATH, 0o600); } catch { /* Windows/filesystems may not support POSIX mode. */ }
}

function argValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}
function has(args: string[], name: string) { return args.includes(name); }
function numberArg(args: string[], name: string, fallback?: number) {
  const raw = argValue(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
}

async function auth(args: string[]) {
  const config = await readConfig();
  const baseUrl = (argValue(args, "--base-url") ?? process.env.TOKEN_INTELLIGENCE_BASE_URL ?? config.baseUrl ?? "https://token-intelligence-eight.vercel.app").replace(/\/$/, "");
  const apiKey = argValue(args, "--api-key") ?? process.env.TOKEN_INTELLIGENCE_API_KEY ?? config.apiKey;
  return { config, baseUrl, apiKey, projectId: argValue(args, "--project") ?? process.env.TOKEN_INTELLIGENCE_PROJECT_ID ?? config.projectId ?? null, environment: argValue(args, "--environment") ?? config.environment ?? "development" };
}

async function requestJson(path: string, args: string[], body?: unknown, requireKey = true) {
  const current = await auth(args);
  if (requireKey && !current.apiKey) throw new Error("TOKEN_INTELLIGENCE_API_KEY is required. Run `npm run ti -- login` or set the environment variable.");
  const response = await fetch(`${current.baseUrl}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "accept": "application/json", ...(current.apiKey ? { "authorization": `Bearer ${current.apiKey}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

function print(value: unknown) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

async function login(args: string[]) {
  const current = await readConfig();
  const rl = createInterface({ input, output });
  try {
    const baseUrl = argValue(args, "--base-url") ?? current.baseUrl ?? "https://token-intelligence-eight.vercel.app";
    const supplied = argValue(args, "--api-key");
    const apiKey = supplied ?? await rl.question("Token Intelligence API key (stored locally with user-only permissions): ");
    if (!/^ti_(live|test)_/.test(apiKey.trim())) throw new Error("Invalid Token Intelligence API key format");
    const projectId = argValue(args, "--project") ?? current.projectId;
    await writeConfig({ ...current, baseUrl: baseUrl.replace(/\/$/, ""), apiKey: apiKey.trim(), projectId });
    console.log(`Saved CLI configuration to ${CONFIG_PATH}.`);
  } finally { rl.close(); }
}

async function status(args: string[]) {
  const current = await auth(args);
  const healthResponse = await fetch(`${current.baseUrl}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const health = await healthResponse.json().catch(() => null);
  const capabilities = await collectorCapabilities();
  print({ baseUrl: current.baseUrl, apiKeyConfigured: Boolean(current.apiKey), projectId: current.projectId, health: { httpStatus: healthResponse.status, data: health }, collectors: capabilities });
}

async function estimate(args: string[]) {
  const payload = { inputTokens: numberArg(args, "--input", 0), outputTokens: numberArg(args, "--output", 0), cachedInputTokens: numberArg(args, "--cached", 0), requestsPerMonth: numberArg(args, "--requests", 1) };
  print(await requestJson("/api/v1/estimate", args, payload, false));
}

async function compare(args: string[]) {
  const payload = { inputTokens: numberArg(args, "--input", 0), outputTokens: numberArg(args, "--output", 0), cachedInputTokens: numberArg(args, "--cached", 0), requestsPerMonth: numberArg(args, "--requests", 1), modelIds: (argValue(args, "--models") ?? "").split(",").filter(Boolean) };
  print(await requestJson("/api/v1/compare", args, payload, false));
}

async function collect(name: CollectorName, file: string, args: string[], upload: boolean) {
  const collector = getCollector(name);
  if (!collector) throw new Error(`Unknown collector ${name}`);
  const current = await auth(args);
  const text = await readFile(resolve(file), "utf8");
  const parsed = collector.parseJsonLines(text.split(/\r?\n/), { projectId: current.projectId, environment: current.environment });
  const summary = { collector: parsed.collector, sessionId: parsed.sessionId, usageClassification: parsed.usageClassification, eventCount: parsed.events.length, warnings: parsed.warnings, measuredFields: parsed.measuredFields, estimatedFields: parsed.estimatedFields, missingFields: parsed.missingFields };
  if (!upload || has(args, "--dry-run")) { print({ dryRun: true, ...summary, events: parsed.events }); return; }
  if (!current.apiKey) throw new Error("TOKEN_INTELLIGENCE_API_KEY is required to sync telemetry");
  const result = await requestJson("/api/v1/events/batch", args, { events: parsed.events });
  print({ dryRun: false, ...summary, result });
}

async function watch(name: CollectorName, file: string, args: string[]) {
  console.log(`Watching ${resolve(file)} with ${name}; only normalized metadata is uploaded.`);
  let lastSize = 0;
  while (true) {
    try {
      const info = await stat(resolve(file));
      if (info.size !== lastSize) {
        await collect(name, file, args, true);
        lastSize = info.size;
      }
    } catch (error) { console.error(error instanceof Error ? error.message : error); }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  }
}

function help() {
  console.log(`Token Intelligence CLI\n\nCommands:\n  login [--api-key KEY] [--base-url URL] [--project ID]\n  status\n  estimate --input N --output N [--cached N] [--requests N]\n  compare --input N --output N --models id,id\n  runs list\n  runs show RUN_ID\n  budget check [--project ID] [--observed-cost N] [--projected-cost N] [--provider P] [--model M]\n  collect <codex|claude|cursor|antigravity> FILE [--project ID] [--dry-run]\n  watch <codex|claude|antigravity> FILE [--project ID]\n  sync <collector> FILE [--project ID] [--dry-run]\n  gateway status\n\nAPI key can also be supplied with TOKEN_INTELLIGENCE_API_KEY. Prompt/code/transcript content is never uploaded by collector commands; parsing occurs locally and only normalized events are sent.`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || ["help", "--help", "-h"].includes(command)) return help();
  if (command === "login") return login(args.slice(1));
  if (command === "status") return status(args.slice(1));
  if (command === "estimate") return estimate(args.slice(1));
  if (command === "compare") return compare(args.slice(1));
  if (command === "runs" && args[1] === "list") return print(await requestJson("/api/v1/runs", args.slice(2)));
  if (command === "runs" && args[1] === "show" && args[2]) return print(await requestJson(`/api/v1/runs/${encodeURIComponent(args[2])}`, args.slice(3)));
  if (command === "budget" && args[1] === "check") {
    const rest = args.slice(2); const current = await auth(rest);
    return print(await requestJson("/api/v1/budgets/check", rest, { projectId: current.projectId, observedCostUsd: numberArg(rest, "--observed-cost", 0), projectedNextCallCostUsd: numberArg(rest, "--projected-cost"), tokens: numberArg(rest, "--tokens", 0), turns: numberArg(rest, "--turns", 0), retries: numberArg(rest, "--retries", 0), failedToolCalls: 0, toolCalls: numberArg(rest, "--tools", 0), provider: argValue(rest, "--provider"), model: argValue(rest, "--model") }));
  }
  if ((command === "collect" || command === "sync") && args[1] && args[2]) return collect(args[1] as CollectorName, args[2], args.slice(3), command === "sync" || !has(args, "--dry-run"));
  if (command === "watch" && args[1] && args[2]) {
    if (args[1] === "cursor") throw new Error("Cursor live watch is not advertised because its available local telemetry remains estimated. Use `collect cursor FILE --dry-run` or `sync cursor FILE`.");
    return watch(args[1] as CollectorName, args[2], args.slice(3));
  }
  if (command === "gateway" && args[1] === "status") return status(args.slice(2));
  help(); process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
