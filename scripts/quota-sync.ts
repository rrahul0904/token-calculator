#!/usr/bin/env node
import process from "node:process";
import { fetchAllProviderQuotas, fetchProviderQuota, isSupportedLocalQuotaProvider, supportedLocalQuotaProviders } from "@/lib/quota/registry";
import { toHostedQuotaSnapshot } from "@/lib/quota/hosted";

const DEFAULT_BASE_URL = "https://token-intelligence-eight.vercel.app";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function hostedBaseUrl(args: string[]): string {
  const raw = argValue(args, "--base-url")
    ?? process.env.TOKEN_INTELLIGENCE_BASE_URL
    ?? DEFAULT_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Quota sync --base-url must be an absolute HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Quota sync refuses non-HTTPS hosted destinations.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Quota sync --base-url must not contain credentials, query parameters, or fragments.");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed.toString().replace(/\/$/, "");
}

async function main() {
  const args = process.argv.slice(2);
  const provider = args[0] ?? "all";
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

  // Hosted upload is intentionally more explicit than local monitoring. The
  // destination and API credential must come from this invocation or its
  // environment; quota-sync never reads a local config file and then uses that
  // file content to choose an outbound HTTP destination or authorization value.
  const baseUrl = hostedBaseUrl(args);
  const apiKey = argValue(args, "--api-key") ?? process.env.TOKEN_INTELLIGENCE_API_KEY;
  if (!apiKey) {
    throw new Error("TOKEN_INTELLIGENCE_API_KEY is required for hosted quota sync; provide --api-key or the environment variable.");
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
    redirect: "error",
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
