import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderQuotaAuthState, ProviderQuotaSnapshot, ProviderQuotaWindow } from "@/lib/quota/types";
import { hasNumericQuota } from "@/lib/quota/types";

const CODEX_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";

interface CodexQuotaFetchOptions {
  authPath?: string;
  authJson?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
}

interface InternalCodexCredentials {
  accessToken: string;
  accountId: string | null;
}

type CredentialParseResult =
  | { ok: true; credentials: InternalCodexCredentials }
  | { ok: false; state: "unsupported_auth" | "malformed"; note: string };

function safeRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function parseCredentials(raw: string): CredentialParseResult {
  let parsed: Record<string, unknown>;
  try {
    const candidate = safeRecord(JSON.parse(raw));
    if (!candidate) throw new Error("shape");
    parsed = candidate;
  } catch {
    return { ok: false, state: "malformed", note: "Codex auth.json is not valid JSON in the expected object shape." };
  }

  const tokens = safeRecord(parsed.tokens);
  if (!tokens) {
    if (stringValue(parsed.OPENAI_API_KEY)) {
      return {
        ok: false,
        state: "unsupported_auth",
        note: "Codex is configured with an API key. ChatGPT subscription quota windows require a Codex OAuth session.",
      };
    }
    return { ok: false, state: "malformed", note: "Codex auth.json does not contain an OAuth tokens block." };
  }

  const accessToken = stringValue(tokens.access_token);
  if (!accessToken) {
    return { ok: false, state: "malformed", note: "Codex OAuth credentials do not contain an access token." };
  }

  // Use the account identifier persisted by Codex itself. Do not decode or trust
  // unverified ID-token claims for request routing or plan metadata. The provider
  // quota response remains the authority for plan information.
  const accountId = stringValue(tokens.account_id);

  return { ok: true, credentials: { accessToken, accountId } };
}

function opaqueAccountRef(accountId: string | null): string | null {
  if (!accountId) return null;
  return `acct_${createHash("sha256").update(accountId).digest("hex").slice(0, 12)}`;
}

export function codexAuthPath(
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = homedir(),
): string {
  const configured = stringValue(env.CODEX_HOME);
  return join(configured ?? join(homeDirectory, ".codex"), "auth.json");
}

function failureSnapshot(
  state: Exclude<ProviderQuotaAuthState, "active" | "signed_in_no_allocation">,
  note: string,
  now: Date,
): ProviderQuotaSnapshot {
  return {
    provider: "codex",
    authState: state,
    source: "provider_reported",
    fetchedAt: now.toISOString(),
    accountRef: null,
    plan: null,
    windows: [],
    note,
  };
}

function windowLabel(block: Record<string, unknown> | null, fallback: string): string {
  const seconds = typeof block?.limit_window_seconds === "number" && Number.isFinite(block.limit_window_seconds)
    ? Math.trunc(block.limit_window_seconds)
    : null;
  if (!seconds || seconds <= 0) return fallback;
  if (seconds % 604_800 === 0 && seconds / 604_800 === 1) return "Wk";
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
  return fallback;
}

function remainingPercent(block: Record<string, unknown> | null): number | null {
  const used = block?.used_percent;
  if (typeof used !== "number" || !Number.isFinite(used)) return null;
  const remaining = Math.min(100, Math.max(0, 100 - used));
  return Math.round(remaining * 10) / 10;
}

function resetAt(block: Record<string, unknown> | null, now: Date): string | null {
  const absolute = block?.reset_at;
  if (typeof absolute === "number" && Number.isFinite(absolute) && absolute >= 0) {
    return new Date(absolute * 1_000).toISOString();
  }
  const relative = block?.reset_after_seconds;
  if (typeof relative === "number" && Number.isFinite(relative) && relative >= 0) {
    return new Date(now.getTime() + relative * 1_000).toISOString();
  }
  return null;
}

function quotaWindow(block: unknown, fallbackLabel: string, now: Date): ProviderQuotaWindow {
  const record = safeRecord(block);
  return {
    label: windowLabel(record, fallbackLabel),
    remainingPercent: remainingPercent(record),
    resetAt: resetAt(record, now),
  };
}

export function normalizeCodexUsagePayload(
  raw: unknown,
  options: { now?: Date; plan?: string | null; accountRef?: string | null } = {},
): ProviderQuotaSnapshot {
  const now = options.now ?? new Date();
  const root = safeRecord(raw);
  const rateLimit = safeRecord(root?.rate_limit);
  const windows = [
    quotaWindow(rateLimit?.primary_window, "5h", now),
    quotaWindow(rateLimit?.secondary_window, "Wk", now),
  ];
  const plan = stringValue(root?.plan_type) ?? options.plan ?? null;
  const active: ProviderQuotaSnapshot = {
    provider: "codex",
    authState: "active",
    source: "provider_reported",
    fetchedAt: now.toISOString(),
    accountRef: options.accountRef ?? null,
    plan,
    windows,
    note: null,
  };

  if (hasNumericQuota(active)) return active;
  return {
    ...active,
    authState: "signed_in_no_allocation",
    note: "Codex accepted the local session but did not report a numeric quota allocation.",
  };
}

/**
 * Read the Codex CLI OAuth session and fetch subscription quota locally.
 *
 * Security boundary: the access token exists only inside this function long
 * enough to construct the provider request. It is never returned, printed,
 * persisted by Token Intelligence, or sent to the hosted Token Intelligence API.
 * This reader never refreshes, rotates, or rewrites Codex credentials.
 */
export async function fetchCodexQuotaSnapshot(
  options: CodexQuotaFetchOptions = {},
): Promise<ProviderQuotaSnapshot> {
  const now = options.now ?? new Date();
  let rawAuth = options.authJson;
  if (rawAuth === undefined) {
    try {
      rawAuth = await readFile(
        options.authPath ?? codexAuthPath(options.env ?? process.env, options.homeDirectory ?? homedir()),
        "utf8",
      );
    } catch (error) {
      const code = safeRecord(error)?.code;
      if (code === "ENOENT") {
        return failureSnapshot("not_signed_in", "No Codex OAuth credentials were found. Sign in with the Codex CLI first.", now);
      }
      return failureSnapshot("unavailable", "Codex credentials could not be read from the local machine.", now);
    }
  }

  const credentialResult = parseCredentials(rawAuth);
  if (!credentialResult.ok) {
    return failureSnapshot(credentialResult.state, credentialResult.note, now);
  }

  const { accessToken, accountId } = credentialResult.credentials;
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "user-agent": "token-intelligence-quota/0.1",
  };
  if (accountId) headers["ChatGPT-Account-Id"] = accountId;

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(CODEX_USAGE_ENDPOINT, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return failureSnapshot("unavailable", "Codex quota could not be reached from this machine.", now);
  }

  if (response.status === 401 || response.status === 403) {
    return failureSnapshot("expired", "Codex rejected the stored OAuth session. Reauthenticate with the Codex CLI; Token Intelligence will not refresh or rewrite it.", now);
  }
  if (!response.ok) {
    return failureSnapshot("unavailable", `Codex quota request failed with HTTP ${response.status}.`, now);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return failureSnapshot("unavailable", "Codex returned a non-JSON quota response.", now);
  }

  return normalizeCodexUsagePayload(payload, {
    now,
    accountRef: opaqueAccountRef(accountId),
  });
}
