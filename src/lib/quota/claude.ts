import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderQuotaAuthState, ProviderQuotaSnapshot, ProviderQuotaWindow } from "@/lib/quota/types";
import { hasNumericQuota } from "@/lib/quota/types";

const CLAUDE_USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_OAUTH_BETA = "oauth-2025-04-20";

interface ClaudeQuotaFetchOptions {
  credentialsPath?: string;
  credentialsJson?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
  homeDirectory?: string;
}

interface InternalClaudeCredentials {
  accessToken: string;
  expiresAtMs: number | null;
  subscriptionType: string | null;
  organizationUuid: string | null;
}

type CredentialParseResult =
  | { ok: true; credentials: InternalClaudeCredentials }
  | { ok: false; state: "malformed"; note: string };

function safeRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCredentials(raw: string): CredentialParseResult {
  let root: Record<string, unknown>;
  try {
    const parsed = safeRecord(JSON.parse(raw));
    if (!parsed) throw new Error("shape");
    root = parsed;
  } catch {
    return { ok: false, state: "malformed", note: "Claude Code credentials are not valid JSON in the expected object shape." };
  }

  const oauth = safeRecord(root.claudeAiOauth);
  if (!oauth) {
    return { ok: false, state: "malformed", note: "Claude Code credentials do not contain a claudeAiOauth block." };
  }

  const accessToken = stringValue(oauth.accessToken);
  if (!accessToken) {
    return { ok: false, state: "malformed", note: "Claude Code OAuth credentials do not contain an access token." };
  }

  return {
    ok: true,
    credentials: {
      accessToken,
      expiresAtMs: numberValue(oauth.expiresAt),
      subscriptionType: stringValue(oauth.subscriptionType),
      organizationUuid: stringValue(root.organizationUuid),
    },
  };
}

function opaqueAccountRef(organizationUuid: string | null): string | null {
  if (!organizationUuid) return null;
  return `org_${createHash("sha256").update(organizationUuid).digest("hex").slice(0, 12)}`;
}

export function claudeCredentialsPath(homeDirectory: string = homedir()): string {
  return join(homeDirectory, ".claude", ".credentials.json");
}

function failureSnapshot(
  state: Exclude<ProviderQuotaAuthState, "active" | "signed_in_no_allocation">,
  note: string,
  now: Date,
  options: { accountRef?: string | null; plan?: string | null } = {},
): ProviderQuotaSnapshot {
  return {
    provider: "claude",
    authState: state,
    source: "provider_reported",
    fetchedAt: now.toISOString(),
    accountRef: options.accountRef ?? null,
    plan: options.plan ?? null,
    windows: [],
    note,
  };
}

function remainingPercent(block: Record<string, unknown> | null): number | null {
  const utilization = numberValue(block?.utilization);
  if (utilization === null) return null;
  const remaining = Math.min(100, Math.max(0, 100 - utilization));
  return Math.round(remaining * 10) / 10;
}

function resetAt(block: Record<string, unknown> | null): string | null {
  const raw = stringValue(block?.resets_at);
  if (!raw) return null;
  const millis = Date.parse(raw);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function quotaWindow(label: string, block: unknown): ProviderQuotaWindow {
  const record = safeRecord(block);
  return {
    label,
    remainingPercent: remainingPercent(record),
    resetAt: resetAt(record),
  };
}

export function normalizeClaudeUsagePayload(
  raw: unknown,
  options: { now?: Date; plan?: string | null; accountRef?: string | null } = {},
): ProviderQuotaSnapshot {
  const now = options.now ?? new Date();
  const root = safeRecord(raw);
  const snapshot: ProviderQuotaSnapshot = {
    provider: "claude",
    authState: "active",
    source: "provider_reported",
    fetchedAt: now.toISOString(),
    accountRef: options.accountRef ?? null,
    plan: options.plan ?? null,
    windows: [
      quotaWindow("5h", root?.five_hour),
      quotaWindow("Wk", root?.seven_day),
    ],
    note: null,
  };

  if (hasNumericQuota(snapshot)) return snapshot;
  return {
    ...snapshot,
    authState: "signed_in_no_allocation",
    note: "Claude accepted the local session but did not report a numeric quota allocation.",
  };
}

/**
 * Read the Claude Code CLI OAuth session and fetch provider-reported usage locally.
 * The provider access token never leaves this function except in the Authorization
 * header sent directly to Anthropic. Token Intelligence never refreshes, rewrites,
 * uploads, persists, or prints the provider credential.
 */
export async function fetchClaudeQuotaSnapshot(
  options: ClaudeQuotaFetchOptions = {},
): Promise<ProviderQuotaSnapshot> {
  const now = options.now ?? new Date();
  let raw = options.credentialsJson;
  if (raw === undefined) {
    try {
      raw = await readFile(
        options.credentialsPath ?? claudeCredentialsPath(options.homeDirectory ?? homedir()),
        "utf8",
      );
    } catch (error) {
      const code = safeRecord(error)?.code;
      if (code === "ENOENT") {
        return failureSnapshot("not_signed_in", "No Claude Code OAuth credentials were found. Sign in with Claude Code first.", now);
      }
      return failureSnapshot("unavailable", "Claude Code credentials could not be read from the local machine.", now);
    }
  }

  const parsed = parseCredentials(raw);
  if (!parsed.ok) return failureSnapshot(parsed.state, parsed.note, now);

  const { accessToken, expiresAtMs, subscriptionType, organizationUuid } = parsed.credentials;
  const accountRef = opaqueAccountRef(organizationUuid);
  if (expiresAtMs !== null && expiresAtMs <= now.getTime()) {
    return failureSnapshot(
      "expired",
      "Claude Code OAuth credentials are expired. Reauthenticate with Claude Code; Token Intelligence will not refresh or rewrite them.",
      now,
      { accountRef, plan: subscriptionType },
    );
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(CLAUDE_USAGE_ENDPOINT, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "anthropic-beta": CLAUDE_OAUTH_BETA,
        "user-agent": "token-intelligence-quota/0.1",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return failureSnapshot("unavailable", "Claude quota could not be reached from this machine.", now, { accountRef, plan: subscriptionType });
  }

  if (response.status === 401 || response.status === 403) {
    return failureSnapshot(
      "expired",
      "Claude rejected the stored OAuth session. Reauthenticate with Claude Code; Token Intelligence will not refresh or rewrite it.",
      now,
      { accountRef, plan: subscriptionType },
    );
  }
  if (!response.ok) {
    return failureSnapshot("unavailable", `Claude quota request failed with HTTP ${response.status}.`, now, { accountRef, plan: subscriptionType });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return failureSnapshot("unavailable", "Claude returned a non-JSON quota response.", now, { accountRef, plan: subscriptionType });
  }

  return normalizeClaudeUsagePayload(payload, {
    now,
    plan: subscriptionType,
    accountRef,
  });
}
