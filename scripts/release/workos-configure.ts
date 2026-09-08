import process from "node:process";
import { normalizedScope } from "./env-contract";

type ListedRedirect = { id?: string; uri?: string; default?: boolean };
type ListedOrigin = { id?: string; origin?: string };

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string, fallback?: string) {
  const value = argument(name) ?? fallback;
  if (!value?.trim()) throw new Error(`MISSING_WORKOS_CONFIG_INPUT:${name}`);
  return value.trim();
}
function wildcardCovers(pattern: string, candidate: string) {
  if (pattern === candidate) return true;
  if (!pattern.includes("*")) return false;
  const escaped = pattern
    .replace(/[.*+?^()|[\]\\{}]/g, "\\$&")
    .replace(/\\\*/g, "[A-Za-z0-9_-]+");
  return new RegExp(`^${escaped}$`).test(candidate);
}
async function workos(path: string, init?: RequestInit) {
  const apiKey = required("api-key", process.env.WORKOS_API_KEY);
  const response = await fetch(`https://api.workos.com${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  return response;
}
async function list<T>(path: string): Promise<T[]> {
  const response = await workos(path);
  if (!response.ok) throw new Error(`WORKOS_CONFIG_LIST_HTTP_${response.status}:${path}`);
  const body = await response.json() as { data?: T[] };
  return Array.isArray(body.data) ? body.data : [];
}
async function create(path: string, body: Record<string, string>) {
  const response = await workos(path, { method: "POST", body: JSON.stringify(body) });
  if (response.status === 422) return "already_registered" as const;
  if (!response.ok) throw new Error(`WORKOS_CONFIG_CREATE_HTTP_${response.status}:${path}`);
  return "created" as const;
}

const scope = normalizedScope(argument("scope") ?? process.env.RELEASE_SCOPE ?? "preview");
const baseUrl = required("base-url", process.env.APP_BASE_URL).replace(/\/$/, "");
const origin = new URL(baseUrl).origin;
if (scope === "production" && !origin.startsWith("https://")) {
  throw new Error("WORKOS_PRODUCTION_REQUIRES_HTTPS");
}
const redirectUri = `${origin}/auth/callback`;

const redirects = await list<ListedRedirect>("/user_management/redirect_uris?limit=100");
const redirectCover = redirects.find((item) => typeof item.uri === "string" && wildcardCovers(item.uri, redirectUri));
const redirectAction = redirectCover
  ? "already_allowed"
  : await create("/user_management/redirect_uris", { uri: redirectUri });

const origins = await list<ListedOrigin>("/user_management/cors_origins?limit=100");
const originCover = origins.find((item) => typeof item.origin === "string" && wildcardCovers(item.origin, origin));
const originAction = originCover
  ? "already_allowed"
  : await create("/user_management/cors_origins", { origin });

process.stdout.write(JSON.stringify({
  provider: "workos",
  scope,
  configured: true,
  redirect: {
    uri: redirectUri,
    action: redirectAction,
    coveredBy: redirectCover?.uri ?? redirectUri,
  },
  corsOrigin: {
    origin,
    action: originAction,
    coveredBy: originCover?.origin ?? origin,
  },
}, null, 2) + "\n");
