#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { fetchAllProviderQuotas, fetchProviderQuota, isSupportedLocalQuotaProvider, supportedLocalQuotaProviders } from "@/lib/quota/registry";
import { toHostedQuotaSnapshot } from "@/lib/quota/hosted";

interface CliConfig {
  baseUrl?: string;
  apiKey?: string;
}

const CONFIG_PATH = resolve(homedir(), ".config", "token-intelligence", "config.json");

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

async function readConfig(): Promise<CliConfig> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8")) as CliConfig;
  } catch {
    return {};
  }
}

async function main() {
  const args = process.argv.slice(2);
  const provider = args[0] ?? "all";
  const config = await readConfig();
  const baseUrl = (argValue(args, "--base-url")
    ?? process.env.TOKEN_INTELLIGENCE_BASE_URL
    ?? config.baseUrl
    ?? "https://token-intelligence-eight.vercel.app").replace(/\/$/, "");
  const apiKey = argValue(args, "--api-key")
    ?? process.env.TOKEN_INTELLIGENCE_API_KEY
    ?? config.apiKey;
  const dryRun = has(args, "--dry-run");

  if (provider !== "all" && !isSupportedLocalQuotaProvider(provider)) {
    throw new Error(`Unsupported quota provider '${provider}'. Supported: ${supportedLocalQuotaProviders().join(", ")}, all.`);
  }

  const localSnapshots = provider === "all"
    ? await fetchAllProviderQuotas()
    : [await fetchProviderQuota(provider)];
  const snapshots = localSnapshots.map(toHostedQuotaSnapshot);

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ dryRun: true, snapshots }, null, 2)}\n`);
    return;
  }
  if (!apiKey) {
    throw new Error("TOKEN_INTELLIGENCE_API_KEY is required. Run `npm run ti -- login` or provide --api-key.");
  }

  const response = await fetch(`${baseUrl}/api/v1/quota/snapshots`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ snapshots }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Quota sync failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
