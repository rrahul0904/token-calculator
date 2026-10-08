import { desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { providerQuotaSnapshots } from "@/db/quota-schema";
import type { ProviderQuotaWindow } from "@/lib/quota/types";

export interface HostedQuotaDashboardRow {
  id: string;
  provider: string;
  authState: string;
  fetchedAt: string;
  receivedAt: string;
  accountRef: string | null;
  plan: string | null;
  windows: ProviderQuotaWindow[];
}

/** Return the newest receipt for each provider/account pair in an organization. */
export async function getLatestProviderQuotaRows(organizationId: string): Promise<HostedQuotaDashboardRow[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getDb()
    .select()
    .from(providerQuotaSnapshots)
    .where(eq(providerQuotaSnapshots.organizationId, organizationId))
    .orderBy(desc(providerQuotaSnapshots.fetchedAt))
    .limit(200);

  const seen = new Set<string>();
  const latest: HostedQuotaDashboardRow[] = [];
  for (const row of rows) {
    const key = `${row.provider}:${row.accountRef ?? "default"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push({
      id: row.id,
      provider: row.provider,
      authState: row.authState,
      fetchedAt: row.fetchedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      accountRef: row.accountRef,
      plan: row.plan,
      windows: Array.isArray(row.windows) ? row.windows : [],
    });
    if (latest.length >= 24) break;
  }
  return latest;
}
