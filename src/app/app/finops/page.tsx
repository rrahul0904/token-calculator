import { AppPageHeader, DataTruthStrip, EmptyState, MetricCard, Money, StatusBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getFinopsData } from "@/lib/finops/data";

function pct(value: number | null) { return value === null ? "Unknown" : `${value.toFixed(1)}%`; }

export default async function FinopsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const data = await getFinopsData(tenant.organizationId);
  const budgetRiskCount = data.weeklyBrief.budgetRisks.length;

  return <>
    <AppPageHeader kicker="Finance command" title="FinOps" description="Forecast, allocate, reconcile and explain AI spend without hiding unknown cost, unverified savings, or unattributed provider charges." />
    <DataTruthStrip />

    <section className="metric-grid">
      <MetricCard tone="cost" label="Known month spend" value={`$${data.knownMonthSpend.toFixed(2)}`} detail={`${data.unknownCostRuns} runs still have unknown cost`} eyebrow="Known cost only" />
      <MetricCard tone="policy" label="Projected month end" value={`$${data.forecast.projectedMonthEndUsd.toFixed(2)}`} detail={`${data.forecast.confidence} confidence · ${data.forecast.method}`} eyebrow="Deterministic forecast" />
      <MetricCard tone={(data.reconciliation.unattributedDifferenceUsd ?? 0) > 0 ? "warning" : "good"} label="Reconciliation coverage" value={pct(data.reconciliation.reconciliationCoveragePct)} detail={data.reconciliation.unattributedDifferenceUsd === null ? "No provider-account total imported" : `$${data.reconciliation.unattributedDifferenceUsd.toFixed(2)} unattributed difference`} />
      <MetricCard tone={data.weeklyBrief.anomalyCount > 0 ? "risk" : "good"} label="Weekly anomalies" value={data.weeklyBrief.anomalyCount.toString()} detail={`${data.weeklyBrief.retryCount} retries · $${data.weeklyBrief.failedAbortedSpendUsd.toFixed(2)} failed/aborted`} />
      <MetricCard tone={budgetRiskCount ? "warning" : "good"} label="Budget risks" value={budgetRiskCount.toString()} detail={budgetRiskCount ? "Scopes approaching or exceeding configured budgets" : "No current budget risk in weekly brief"} />
    </section>

    <div className="finops-story" aria-label="Finance operating loop">
      <div><span>01</span><small>Attribute</small><strong>Who owns the spend?</strong></div>
      <div><span>02</span><small>Forecast</small><strong>Where will month-end land?</strong></div>
      <div><span>03</span><small>Reconcile</small><strong>What is still unattributed?</strong></div>
      <div><span>04</span><small>Act</small><strong>Which risks need control?</strong></div>
    </div>

    <div className="app-grid">
      <section className="app-panel"><div className="app-panel__header"><div><h2>Project showback</h2><p>Known cost stays separate from unknown-cost runs.</p></div><span className="receipt-evidence">project ownership</span></div>{data.showback.project.length ? <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Project</th><th>Known spend</th><th>Runs</th><th>Unknown cost</th></tr></thead><tbody>{data.showback.project.map((row) => <tr key={row.key}><td>{row.label}</td><td className="mono"><Money value={row.knownSpendUsd} /></td><td>{row.runCount}</td><td>{row.unknownCostRows ? <StatusBadge status={`${row.unknownCostRows} unknown`} /> : "0"}</td></tr>)}</tbody></table></div> : <div className="app-panel__body"><EmptyState title="No project spend yet" body="Project showback appears after run receipts carry project attribution." /></div>}</section>
      <section className="app-panel"><div className="app-panel__header"><div><h2>Cost centers</h2><p>Finance ownership without requiring an ERP integration.</p></div><span className="receipt-evidence">showback</span></div>{data.showback.costCenter.length ? <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Cost center</th><th>Known spend</th><th>Runs</th></tr></thead><tbody>{data.showback.costCenter.map((row) => <tr key={row.key}><td>{row.label}</td><td className="mono"><Money value={row.knownSpendUsd} /></td><td>{row.runCount}</td></tr>)}</tbody></table></div> : <div className="app-panel__body"><EmptyState title="No cost-center assignments" body="Unassigned spend remains visible rather than being guessed into a finance bucket." /></div>}</section>
    </div>

    <div className="app-grid">
      <section id="reconciliation" className="app-panel"><div className="app-panel__header"><div><h2>Provider reconciliation</h2><p>Provider-account spend versus run-attributed spend. The gap is a first-class number.</p></div><span className="receipt-evidence">measured / imported</span></div><div className="app-panel__body"><div className="reconciliation-grid"><div><span>Provider account</span><strong><Money value={data.reconciliation.providerAccountSpendUsd} /></strong><small>Measured or imported total</small></div><div><span>Run attributed</span><strong><Money value={data.reconciliation.attributedRunSpendUsd} /></strong><small>Receipts mapped to runs</small></div><div className={(data.reconciliation.unattributedDifferenceUsd ?? 0) > 0 ? "reconciliation-grid__risk" : ""}><span>Unattributed</span><strong><Money value={data.reconciliation.unattributedDifferenceUsd} /></strong><small>{pct(data.reconciliation.reconciliationCoveragePct)} coverage</small></div></div></div></section>
      <section className="app-panel"><div className="app-panel__header"><div><h2>Weekly economics brief</h2><p>Deterministic summary of the main economic movement—no LLM required.</p></div><span className="receipt-evidence">7-day change</span></div><div className="app-panel__body"><div className="weekly-brief"><div className="weekly-brief__hero"><small>Period spend</small><strong>${data.weeklyBrief.periodSpendUsd.toFixed(2)}</strong><span>{data.weeklyBrief.changePct === null ? "No comparable prior period" : `${data.weeklyBrief.changePct >= 0 ? "+" : ""}${data.weeklyBrief.changePct.toFixed(1)}% vs prior week`}</span></div><div className="weekly-brief__facts"><div><span>Failed / aborted</span><strong>${data.weeklyBrief.failedAbortedSpendUsd.toFixed(2)}</strong></div><div><span>Fallback premium</span><strong>${data.weeklyBrief.fallbackPremiumUsd.toFixed(2)}</strong></div><div><span>Cache read share</span><strong>{data.weeklyBrief.cacheReadShare === null ? "Unknown" : `${(data.weeklyBrief.cacheReadShare * 100).toFixed(1)}%`}</strong></div></div>{data.weeklyBrief.budgetRisks.slice(0, 5).map((risk) => <div className="budget-risk-row" key={risk.name}><span>{risk.name}</span><strong>{risk.utilizationPct.toFixed(1)}%</strong></div>)}</div></div></section>
    </div>

    {data.anomaly ? <section className="app-panel anomaly-panel"><div className="app-panel__header"><div><h2>Spend anomaly</h2><p>Rolling-median/MAD detection with a minimum history threshold.</p></div><StatusBadge status={data.anomaly.confidence} /></div><div className="app-panel__body"><div className="anomaly-evidence"><div><span>Metric</span><strong>{data.anomaly.metric}</strong></div><div><span>Observed</span><strong>${data.anomaly.observed.toFixed(2)}</strong></div><div><span>Baseline</span><strong>${data.anomaly.baseline.toFixed(2)}</strong></div><div><span>Delta</span><strong>${data.anomaly.delta.toFixed(2)}</strong></div><div><span>Sample</span><strong>{data.anomaly.sampleSize}</strong></div></div></div></section> : null}
  </>;
}
