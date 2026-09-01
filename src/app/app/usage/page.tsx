import { AppPageHeader, EmptyState, MetricCard, Money } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getOverviewData } from "@/lib/app-data";

function formatTokens(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

export default async function UsagePage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const data = await getOverviewData(tenant.organizationId);
  const totalTokens = data.tokens.fresh + data.tokens.cache + data.tokens.reasoning + data.tokens.output;

  const rows = [
    ["Fresh input", data.tokens.fresh],
    ["Cache read", data.tokens.cache],
    ["Reasoning", data.tokens.reasoning],
    ["Output", data.tokens.output],
  ] as const;

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
  </>;
}
