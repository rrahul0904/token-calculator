export type ProviderQuotaName =
  | "codex"
  | "claude"
  | "cursor"
  | "antigravity"
  | "copilot"
  | "kiro"
  | "grok"
  | "opencode-go";

export type ProviderQuotaAuthState =
  | "active"
  | "signed_in_no_allocation"
  | "not_signed_in"
  | "unsupported_auth"
  | "expired"
  | "malformed"
  | "unavailable";

export interface ProviderQuotaWindow {
  /** Provider-native or provider-derived short window label, for example 5h or Wk. */
  label: string;
  /** Percentage still available in the provider window. Unknown remains null. */
  remainingPercent: number | null;
  /** Provider-reported reset time normalized to ISO-8601. Unknown remains null. */
  resetAt: string | null;
}

export interface ProviderQuotaSnapshot {
  provider: ProviderQuotaName;
  authState: ProviderQuotaAuthState;
  source: "provider_reported";
  fetchedAt: string;
  /** Opaque local account reference. Never a bearer token, refresh token, email, or raw provider account id. */
  accountRef: string | null;
  plan: string | null;
  windows: ProviderQuotaWindow[];
  note: string | null;
}

export function hasNumericQuota(snapshot: ProviderQuotaSnapshot): boolean {
  return snapshot.windows.some((window) => window.remainingPercent !== null);
}

export function formatProviderQuotaSnapshot(snapshot: ProviderQuotaSnapshot): string {
  const header = `${snapshot.provider} quota`;
  const details = snapshot.windows
    .filter((window) => window.remainingPercent !== null)
    .map((window) => {
      const reset = window.resetAt ? ` · resets ${window.resetAt}` : "";
      return `${window.label} ${window.remainingPercent}% left${reset}`;
    });

  const lines = [header, `status: ${snapshot.authState}`];
  if (snapshot.plan) lines.push(`plan: ${snapshot.plan}`);
  if (snapshot.accountRef) lines.push(`account: ${snapshot.accountRef}`);
  if (details.length) lines.push(...details);
  if (snapshot.note) lines.push(snapshot.note);
  return `${lines.join("\n")}\n`;
}
