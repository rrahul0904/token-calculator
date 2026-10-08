import { AppPageHeader, EmptyState, MetricCard, Money } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getOverviewData } from "@/lib/app-data";
import { getLatestProviderQuotaRows } from "@/lib/quota/hosted-data";

function formatTokens(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function providerLabel(value: string) {
  return value.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatQuota(value: number | null) {
  return value === null ? "Unknown" : `${value.toFixed(value % 1 ? 1 : 0)}% left`;
}

export default async function UsagePage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const [data, quotaRows] = await Promise.all([
    getOverviewData(tenant.organizationId),
    getLatestProviderQuotaRows(tenant.organizationId),
  ]);
  const totalTokens = data.tokens.fresh + data.tokens.cache + data.tokens.reasoning + data.tokens.output;

  const rows = [
    ["Fresh input", data.tokens.fresh],
    ["Cache read", data.tokens.cache],
    ["Reasoning", data.tokens.reasoning],
    ["Output", data.tokens.output],
  ] as const;

  const numericQuota = quotaRows.flatMap((row) => row.windows.map((window) => window.remainingPercent)).filter((value): value is number => value !== null);
  const lowestQuota = numericQuota.length ? Math.min(...numericQuota) : null;

  return <>
    <AppPageHeader kicker="FinOps" title="Usage" description="Finance-readable usage without collapsing provider-native token categories or treating unknown pricing as free." />
    <section className="metric-grid">
      <MetricCard label="Known spend" value={data.spend === null ? "Unknown" : `$${data.spend.toFixed(2)}`} detail="30-day run ledger" />
      <MetricCard label="All tokens" value={formatTokens(totalTokens)} detail={`${data.runCount} runs`} />
      <MetricCard label="Average known cost / run" value={data.averageCostPerRun === null ? "Unknown" : `$${data.averageCostPerRun.toFixed(3)}`} detail="Known-cost runs only" />
      <MetricCard label="Failed / aborted" value={data.failedSpend === null ? "Unknown" : `$${data.failedSpend.toFixed(2)}`} detail="Spend that did not complete cleanly" warning={(data.failedSpend ?? 0) > 0} />
    </section>
    <div className="app-grid">
      <section className="app-panel"><div className="app-panel__header"><div><h2>Token categories</h2><p>Cache and reasoning remain visible instead of being folded into generic input/output.</p></div></div><div className="app-table-wrap"><table className="app-table"><thead><tr><th>Category</th><th>Tokens</th><th>Share</th></tr></thead><tbody>{rows.map(([name, value]) => <tr key={name}><td>{name}</td><td className="mono">{formatTokens(value)}</td><td className="mono">{totalTokens ? `${(value / totalTokens * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table></div></section>
      <section className="app-panel"><div className="app-panel__header"><div><h2>Provider spend</h2><p>Only rows with a known economic value contribute.</p></div></div><div className="app-panel__body">{data.providerBreakdown.length ? <div className="finding-list">{data.providerBreakdown.map((row) => <div className="finding" key={row.name}><div className="finding__top"><h3>{row.name}</h3><span className="mono"><Money value={row.value} /></span></div></div>)}</div> : <EmptyState mark="—" title="No known provider spend" body="Usage can still be present when pricing is unknown. Unknown cost remains unknown rather than becoming $0." />}</div></section>
    </div>

    <section className="app-panel" style={{ marginTop: 24 }}>
      <div className="app-panel__header">
        <div>
          <h2>Provider quota</h2>
          <p>Metadata-only quota receipts from local provider sessions. Provider credentials never enter the hosted product.</p>
        </div>
        <div className="mono">{quotaRows.length ? `${quotaRows.length} account${quotaRows.length === 1 ? "" : "s"}${lowestQuota === null ? "" : ` · lowest ${formatQuota(lowestQuota)}`}` : "No receipts"}</div>
      </div>
      <div className="app-panel__body">
        {quotaRows.length ? <div className="finding-list">
          {quotaRows.map((row) => <div className="finding" key={row.id}>
            <div className="finding__top">
              <div>
                <h3>{providerLabel(row.provider)}{row.plan ? ` · ${row.plan}` : ""}</h3>
                <p>{row.authState === "active" ? "Provider-reported quota" : row.authState.replaceAll("_", " ")} · fetched {new Date(row.fetchedAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })}</p>
              </div>
              {row.accountRef ? <span className="mono">{row.accountRef}</span> : null}
            </div>
            {row.windows.length ? <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Window</th><th>Remaining</th><th>Reset</th></tr></thead><tbody>{row.windows.map((window) => <tr key={`${row.id}:${window.label}`}><td>{window.label}</td><td className="mono">{formatQuota(window.remainingPercent)}</td><td className="mono">{window.resetAt ? new Date(window.resetAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" }) : "Unknown"}</td></tr>)}</tbody></table></div> : null}
          </div>)}
        </div> : <EmptyState mark="Q" title="No provider quota receipts yet" body="Run `npm run quota:sync -- all` from a machine with supported provider sessions. Only normalized quota metadata is uploaded." />}
      </div>
    </section>
  </>;
}
