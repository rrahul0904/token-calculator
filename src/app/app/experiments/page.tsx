import { AppPageHeader, DataTruthStrip, EmptyState, MetricCard, Money, SourceBadge, StatusBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getExperimentsDashboardData } from "@/lib/design-dashboard-data";

function pct(value: number | null) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }
function latency(value: number | null) { return value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`; }

export default async function ExperimentsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const data = await getExperimentsDashboardData(tenant.organizationId);
  const completed = data.items.filter((item) => item.resultCount > 0).length;
  return <>
    <AppPageHeader kicker="Outcome verification" title="Experiments" description="Prove that a cheaper prompt, model, route, or context configuration remains equally good—or better—on a versioned evaluation dataset." />
    <DataTruthStrip />
    <section className="metric-grid">
      <MetricCard label="Experiments" value={data.items.length.toString()} detail={`${completed} with recorded results`} />
      <MetricCard label="Evaluation datasets" value={data.datasetCount.toString()} detail="Versioned test workloads" />
      <MetricCard tone="good" label="Result observations" value={data.resultCount.toLocaleString()} detail="Cost + quality evidence where recorded" eyebrow="experiment evidence" />
      <MetricCard tone="policy" label="Verification rule" value="Cheaper + good" detail="Cost improvement alone never counts as verified savings" />
    </section>
    {data.items.length === 0 ? <section className="app-panel"><div className="app-panel__body"><EmptyState title="No experiments yet" body="Create a versioned evaluation dataset and compare the same workload across prompt, route, model, or context configurations. Until then, optimization remains estimated or historically observed." /></div></section> : <div className="app-stack">{data.items.map((item) => <section className="app-panel" key={item.id}><div className="app-panel__header"><div><h2>{item.name}</h2><p>{item.dataset ? `${item.dataset.name} · dataset v${item.dataset.version}` : "Dataset metadata unavailable"}</p></div><div className="app-header-actions"><StatusBadge status={item.status} /><SourceBadge source={item.evidence} /></div></div><div className="app-panel__body">{item.variants.length === 0 ? <EmptyState mark="—" title="Experiment configured; results pending" body="No result rows have been recorded, so the UI does not infer a winner." /> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Variant</th><th>Cases</th><th>Success</th><th>Median quality</th><th>Median cost</th><th>Median latency</th></tr></thead><tbody>{item.variants.map((variant) => <tr key={variant.variant}><td>{variant.variant}</td><td>{variant.count}</td><td>{pct(variant.successRate)}</td><td className="mono">{variant.medianQuality === null ? "—" : variant.medianQuality.toFixed(3)}</td><td className="mono"><Money value={variant.medianCostUsd} /></td><td className="mono">{latency(variant.medianLatencyMs)}</td></tr>)}</tbody></table></div>}</div></section>)}</div>}
  </>;
}
