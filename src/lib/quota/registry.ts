import { fetchAntigravityQuotaSnapshot } from "@/lib/quota/antigravity";
import { fetchClaudeQuotaSnapshot } from "@/lib/quota/claude";
import { fetchCodexQuotaSnapshot } from "@/lib/quota/codex";
import type { ProviderQuotaSnapshot } from "@/lib/quota/types";

export type SupportedLocalQuotaProvider = "codex" | "claude" | "antigravity";

const fetchers: Record<SupportedLocalQuotaProvider, () => Promise<ProviderQuotaSnapshot>> = {
  codex: fetchCodexQuotaSnapshot,
  claude: fetchClaudeQuotaSnapshot,
  antigravity: fetchAntigravityQuotaSnapshot,
};

export function supportedLocalQuotaProviders(): SupportedLocalQuotaProvider[] {
  return ["codex", "claude", "antigravity"];
}

export function isSupportedLocalQuotaProvider(name: string): name is SupportedLocalQuotaProvider {
  return name === "codex" || name === "claude" || name === "antigravity";
}

export async function fetchProviderQuota(name: string): Promise<ProviderQuotaSnapshot> {
  if (!isSupportedLocalQuotaProvider(name)) {
    throw new Error(`Unsupported provider quota adapter: ${name}`);
  }
  return fetchers[name]();
}

export async function fetchAllProviderQuotas(): Promise<ProviderQuotaSnapshot[]> {
  return Promise.all(supportedLocalQuotaProviders().map((provider) => fetchers[provider]()));
}
