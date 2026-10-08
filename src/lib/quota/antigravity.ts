import { open, readdir, stat } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { ProviderQuotaSnapshot, ProviderQuotaWindow } from "@/lib/quota/types";
import { hasNumericQuota } from "@/lib/quota/types";

const LANGUAGE_SERVER_SERVICE = "exa.language_server_pb.LanguageServerService";
const LOG_TAIL_BYTES = 256 * 1024;

interface AntigravityQuotaFetchOptions {
  now?: Date;
  fetchImpl?: typeof fetch;
  homeDirectory?: string;
  logPaths?: string[];
  port?: number;
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeReset(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const millis = Date.parse(raw);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

async function readTail(path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    const start = Math.max(0, info.size - LOG_TAIL_BYTES);
    const length = info.size - start;
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(length);
      if (length) await handle.read(buffer, 0, length, start);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export function discoverAntigravityPortFromText(text: string): number | null {
  let found: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    const match = /listening on random port at\s+(\d+)\s+for HTTP\b/.exec(line);
    if (!match || /HTTPS/.test(line)) continue;
    const port = Number(match[1]);
    if (Number.isInteger(port) && port >= 1 && port <= 65_535) found = port;
  }
  return found;
}

async function recentIdeLogs(homeDirectory: string): Promise<string[]> {
  const roots = platform() === "darwin"
    ? [
        join(homeDirectory, "Library", "Application Support", "Antigravity", "logs"),
        join(homeDirectory, "Library", "Application Support", "Antigravity IDE", "logs"),
      ]
    : platform() === "win32"
      ? [
          join(process.env.APPDATA ?? join(homeDirectory, "AppData", "Roaming"), "Antigravity", "logs"),
          join(process.env.APPDATA ?? join(homeDirectory, "AppData", "Roaming"), "Antigravity IDE", "logs"),
        ]
      : [
          join(process.env.XDG_DATA_HOME ?? join(homeDirectory, ".local", "share"), "Antigravity", "logs"),
          join(process.env.XDG_DATA_HOME ?? join(homeDirectory, ".local", "share"), "Antigravity IDE", "logs"),
          join(homeDirectory, ".antigravity", "logs"),
        ];

  const candidates: Array<{ path: string; modified: number }> = [];
  for (const root of roots) {
    let sessions;
    try { sessions = await readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const extensionDir = join(root, session.name, "window1", "exthost", "google.antigravity");
      for (const filename of ["Antigravity.log", "Antigravity IDE.log"]) {
        const path = join(extensionDir, filename);
        try {
          const info = await stat(path);
          if (info.isFile()) candidates.push({ path, modified: info.mtimeMs });
        } catch { /* Candidate does not exist. */ }
      }
    }
  }
  return candidates.sort((a, b) => b.modified - a.modified).map((item) => item.path);
}

export async function antigravityLogCandidates(homeDirectory = homedir()): Promise<string[]> {
  const cli = join(homeDirectory, ".gemini", "antigravity-cli", "cli.log");
  return [cli, ...(await recentIdeLogs(homeDirectory))];
}

export async function discoverAntigravityPort(options: Pick<AntigravityQuotaFetchOptions, "homeDirectory" | "logPaths"> = {}): Promise<number | null> {
  const candidates = options.logPaths ?? await antigravityLogCandidates(options.homeDirectory ?? homedir());
  for (const path of candidates) {
    const text = await readTail(path);
    if (!text) continue;
    const port = discoverAntigravityPortFromText(text);
    if (port !== null) return port;
  }
  return null;
}

async function callLanguageServer(fetchImpl: typeof fetch, port: number, method: string): Promise<unknown> {
  const response = await fetchImpl(`http://127.0.0.1:${port}/${LANGUAGE_SERVER_SERVICE}/${method}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      "user-agent": "token-intelligence-quota/0.1",
    },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`Antigravity ${method} request failed with HTTP ${response.status}.`);
  return response.json();
}

function parseModelWindows(payload: unknown): ProviderQuotaWindow[] {
  const root = safeRecord(payload);
  const response = safeRecord(root?.response);
  const models = safeRecord(response?.models);
  if (!models) return [];

  const byLabel = new Map<string, ProviderQuotaWindow>();
  for (const model of Object.values(models)) {
    const record = safeRecord(model);
    if (!record || stringValue(record.modelProvider) !== "MODEL_PROVIDER_GOOGLE") continue;
    const label = stringValue(record.displayName);
    const quota = safeRecord(record.quotaInfo);
    const fraction = numberValue(quota?.remainingFraction);
    if (!label || fraction === null) continue;
    const remainingPercent = Math.round(Math.min(1, Math.max(0, fraction)) * 1_000) / 10;
    byLabel.set(label, {
      label,
      remainingPercent,
      resetAt: normalizeReset(quota?.resetTime),
    });
  }
  return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function parsePlan(payload: unknown): string | null {
  const root = safeRecord(payload);
  const userStatus = safeRecord(root?.userStatus);
  const planStatus = safeRecord(userStatus?.planStatus);
  const planInfo = safeRecord(planStatus?.planInfo);
  return stringValue(planInfo?.planName);
}

export function normalizeAntigravityPayloads(options: {
  status: unknown;
  models: unknown;
  now?: Date;
}): ProviderQuotaSnapshot {
  const now = options.now ?? new Date();
  const windows = parseModelWindows(options.models);
  const snapshot: ProviderQuotaSnapshot = {
    provider: "antigravity",
    authState: "active",
    source: "provider_reported",
    fetchedAt: now.toISOString(),
    accountRef: null,
    plan: parsePlan(options.status),
    windows,
    note: null,
  };
  if (hasNumericQuota(snapshot)) return snapshot;
  return {
    ...snapshot,
    authState: "signed_in_no_allocation",
    note: "Antigravity language server responded but did not report numeric Google-model quota.",
  };
}

/**
 * Read Antigravity quota from its already-authenticated loopback language server.
 * No Google OAuth token, cookie, or refresh credential is read by Token Intelligence.
 * Network access is hard-coded to 127.0.0.1 and a validated local port.
 */
export async function fetchAntigravityQuotaSnapshot(
  options: AntigravityQuotaFetchOptions = {},
): Promise<ProviderQuotaSnapshot> {
  const now = options.now ?? new Date();
  const port = options.port ?? await discoverAntigravityPort(options);
  if (!port || !Number.isInteger(port) || port < 1 || port > 65_535) {
    return {
      provider: "antigravity",
      authState: "unavailable",
      source: "provider_reported",
      fetchedAt: now.toISOString(),
      accountRef: null,
      plan: null,
      windows: [],
      note: "Antigravity live quota is unavailable because no running local language-server HTTP port was discovered.",
    };
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const [status, models] = await Promise.all([
      callLanguageServer(fetchImpl, port, "GetUserStatus"),
      callLanguageServer(fetchImpl, port, "GetAvailableModels"),
    ]);
    return normalizeAntigravityPayloads({ status, models, now });
  } catch {
    return {
      provider: "antigravity",
      authState: "unavailable",
      source: "provider_reported",
      fetchedAt: now.toISOString(),
      accountRef: null,
      plan: null,
      windows: [],
      note: "Antigravity local language server could not provide quota metadata.",
    };
  }
}
