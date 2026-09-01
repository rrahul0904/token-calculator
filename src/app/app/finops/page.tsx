import { AppPageHeader, EmptyState, MetricCard, Money } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getFinopsData } from "@/lib/finops/data";

function pct(value: number | null) { return value === null ? "Unknown" : `${value.toFixed(1)}%`; }

export default async function FinopsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const data = await getFinopsData(tenant.organizationId);
  return <>
    <AppPageHeader kicker="Finance control" title="FinOps" description="Forecast, allocate, reconcile and explain AI spend without hiding unknown cost or unattributed provider charges." />
    <section className="metric-grid">
      <MetricCard label="Known month spend" value={`$${data.knownMonthSpend.toFixed(2)}`} detail={`${data.unknownCostRuns} runs still have unknown cost`} />
      <MetricCard label="Projected month end" value={`$${data.forecast.projectedMonthEndUsd.toFixed(2)}`} detail={`${data.forecast.confidence} confidence · ${data.forecast.method}`} />
      <MetricCard label="Reconciliation coverage" value={pct(data.reconciliation.reconciliationCoveragePct)} detail={data.reconciliation.unattributedDifferenceUsd === null ? "No provider-account total imported" : `$${data.reconciliation.unattributedDifferenceUsd.toFixed(2)} unattributed difference`} warning={(data.reconciliation.unattributedDifferenceUsd ?? 0) > 0} />
      <MetricCard label="Weekly anomalies" value={data.weeklyBrief.anomalyCount.toString()} detail={`${data.weeklyBrief.retryCount} retries · $${data.weeklyBrief.failedAbortedSpendUsd.toFixed(2)} failed/aborted spend`} warning={data.weeklyBrief.anomalyCount > 0} />
    </section>

    <div className="app-grid">
      <section className="app-panel"><div className="app-panel__header"><div><h2>Project showback</h2><p>Known cost stays separate from unknown-cost runs.</p></div></div>{data.showback.project.length ? <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Project</th><th>Known spend</th><th>Runs</th><th>Unknown cost</th></tr></thead><tbody>{data.showback.project.map((row) => <tr key={row.key}><td>{row.label}</td><td className="mono"><Money value={row.knownSpendUsd} /></td><td>{row.runCount}</td><td>{row.unknownCostRows}</td></tr>)}</tbody></table></div> : <div className="app-panel__body"><EmptyState title="No project spend yet" body="Project showback appears after run receipts carry project attribution." /></div>}</section>
      <section className="app-panel"><div className="app-panel__header"><div><h2>Cost centers</h2><p>Project/team cost-center tags support finance showback without requiring an ERP integration.</p></div></div>{data.showback.costCenter.length ? <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Cost center</th><th>Known spend</th><th>Runs</th></tr></thead><tbody>{data.showback.costCenter.map((row) => <tr key={row.key}><td>{row.label}</td><td className="mono"><Money value={row.knownSpendUsd} /></td><td>{row.runCount}</td></tr>)}</tbody></table></div> : <div className="app-panel__body"><EmptyState title="No cost-center assignments" body="Unassigned spend remains visible rather than being guessed into a finance bucket." /></div>}</section>
    </div>

    <div className="app-grid">
      <section className="app-panel"><div className="app-panel__header"><div><h2>Provider reconciliation</h2><p>Imported provider-account spend is compared with run-attributed spend; the difference is never hidden.</p></div></div><div className="app-panel__body"><div className="finding-list"><div className="finding"><div className="finding__top"><h3>Provider-account measured/imported</h3><strong><Money value={data.reconciliation.providerAccountSpendUsd} /></strong></div></div><div className="finding"><div className="finding__top"><h3>Run-attributed</h3><strong><Money value={data.reconciliation.attributedRunSpendUsd} /></strong></div></div><div className="finding"><div className="finding__top"><h3>Unattributed difference</h3><strong><Money value={data.reconciliation.unattributedDifferenceUsd} /></strong></div><p>Coverage: {pct(data.reconciliation.reconciliationCoveragePct)}</p></div></div></div></section>
      <section className="app-panel"><div className="app-panel__header"><div><h2>Weekly deterministic brief</h2><p>No LLM is required to explain the main economic changes.</p></div></div><div className="app-panel__body"><div className="finding-list"><div className="finding"><p><strong>Spend:</strong> ${data.weeklyBrief.periodSpendUsd.toFixed(2)} vs ${data.weeklyBrief.previousPeriodSpendUsd.toFixed(2)} prior week {data.weeklyBrief.changePct === null ? "" : `(${data.weeklyBrief.changePct >= 0 ? "+" : ""}${data.weeklyBrief.changePct.toFixed(1)}%)`}</p><p><strong>Failed/aborted:</strong> ${data.weeklyBrief.failedAbortedSpendUsd.toFixed(2)} · <strong>fallback premium:</strong> ${data.weeklyBrief.fallbackPremiumUsd.toFixed(2)} · <strong>cache read share:</strong> {data.weeklyBrief.cacheReadShare === null ? "Unknown" : `${(data.weeklyBrief.cacheReadShare * 100).toFixed(1)}%`}</p></div>{data.weeklyBrief.budgetRisks.slice(0, 5).map((risk) => <div className="finding" key={risk.name}><p><strong>{risk.name}</strong> · {risk.utilizationPct.toFixed(1)}% budget utilization</p></div>)}</div></div></section>
    </div>

    {data.anomaly ? <section className="app-panel"><div className="app-panel__header"><div><h2>Spend anomaly</h2><p>Rolling-median/MAD detection with a minimum history threshold.</p></div></div><div className="app-panel__body"><div className="finding"><div className="finding__top"><h3>{data.anomaly.metric}</h3><strong>{data.anomaly.confidence}</strong></div><p>Observed ${data.anomaly.observed.toFixed(2)} vs baseline ${data.anomaly.baseline.toFixed(2)} · delta ${data.anomaly.delta.toFixed(2)} · sample {data.anomaly.sampleSize}</p></div></div></section> : null}
  </>;
}
