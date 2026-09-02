import Link from "next/link";
import { AppPageHeader, DataTruthStrip, EmptyState, MetricCard, Money, SourceBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getRouteLabData } from "@/lib/design-dashboard-data";

function pct(value: number | null) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }
function latency(value: number | null) { return value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`; }

export default async function RouteLabPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const data = await getRouteLabData(tenant.organizationId);
  const observed = data.cohorts.filter((cohort) => cohort.evidence === "historically_observed");
  return <>
    <AppPageHeader kicker="Historical optimization" title="Route Lab" description="Compare provider/model cohorts using actual historical cost, latency, retry and outcome evidence. Low-sample routes stay explicitly inconclusive." actions={<><Link className="button button--ghost" href="/app/findings">View findings</Link><Link className="button button--primary" href="/app/experiments">Run controlled experiment</Link></>} />
    <DataTruthStrip />
    <section className="metric-grid">
      <MetricCard label="LLM calls analyzed" value={data.totalCalls.toLocaleString()} detail="Last 45 days, bounded query" />
      <MetricCard label="Runs represented" value={data.totalRuns.toLocaleString()} detail="Outcome evidence source" />
      <MetricCard tone="good" label="Observed cohorts" value={data.observedCohorts.toString()} detail="At least 5 comparable runs" eyebrow="historically observed" />
      <MetricCard label="Inconclusive cohorts" value={(data.cohorts.length - data.observedCohorts).toString()} detail="Shown, but never promoted as a recommendation" />
    </section>
    <section className="app-panel"><div className="app-panel__header"><div><h2>Route evidence</h2><p>Price alone never determines the preferred route. Success evidence remains beside cost and latency.</p></div><SourceBadge source="historically_observed" /></div>{data.cohorts.length === 0 ? <div className="app-panel__body"><EmptyState title="No route history yet" body="Route Lab needs model-call telemetry tied to run outcomes. Connect a collector or use the governed gateway first." href="/app/integrations" action="Connect telemetry" /></div> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Provider</th><th>Model</th><th>Comparable runs</th><th>Success rate</th><th>Median call cost</th><th>Median latency</th><th>Retry rate</th><th>Evidence</th></tr></thead><tbody>{data.cohorts.map((cohort) => <tr key={`${cohort.provider}:${cohort.model}`}><td>{cohort.provider}</td><td className="mono">{cohort.model}</td><td>{cohort.runCount}</td><td>{pct(cohort.successRate)}</td><td className="mono"><Money value={cohort.medianCallCostUsd} /></td><td className="mono">{latency(cohort.medianLatencyMs)}</td><td>{pct(cohort.retryRate)}</td><td>{cohort.evidence === "historically_observed" ? <SourceBadge source="historically_observed" /> : <SourceBadge source="unavailable" />}</td></tr>)}</tbody></table></div>}</section>
    {observed.length >= 2 ? <section className="app-panel"><div className="app-panel__header"><div><h2>What this evidence can support</h2><p>Observed differences can generate an experiment candidate. They are not a quality guarantee or verified savings claim.</p></div></div><div className="app-panel__body"><div className="finding-list"><div className="finding"><div className="finding__top"><h3>Controlled comparison is available</h3><SourceBadge source="counterfactual_estimate" /></div><p>{observed.length} route cohorts meet the minimum sample threshold. Use the same versioned evaluation dataset to test a candidate before enforcing a route change.</p><p><Link href="/app/experiments">Open experiments →</Link></p></div></div></div></section> : null}
  </>;
}
