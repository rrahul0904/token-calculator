import Link from "next/link";
import { AppPageHeader, DataTruthStrip, EmptyState, MetricCard, Money, SourceBadge, StatusBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getFindingsDashboardData } from "@/lib/design-dashboard-data";

function compact(value: number) { return new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }

export default async function FindingsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const data = await getFindingsDashboardData(tenant.organizationId);
  return <>
    <AppPageHeader kicker="Waste intelligence" title="Findings" description="Deterministic economic findings across real runs. Every recommendation carries evidence, confidence, estimated impact, and a recipe for proving whether the change actually helps." actions={<Link className="button button--primary" href="/app/route-lab">Compare routes</Link>} />
    <DataTruthStrip />
    <section className="metric-grid">
      <MetricCard label="Findings" value={data.total.toString()} detail={`${data.affectedRuns} runs affected`} />
      <MetricCard tone="warning" label="Estimated avoidable tokens" value={compact(data.estimatedWasteTokens)} detail="Rule-derived estimate; not verified savings" eyebrow="estimated" />
      <MetricCard tone="warning" label="Estimated avoidable cost" value={data.estimatedWasteUsd === null ? "Unknown" : `$${data.estimatedWasteUsd.toFixed(2)}`} detail="Only findings with known price evidence" eyebrow="estimated" />
      <MetricCard tone={data.severeCount ? "risk" : "good"} label="High / critical" value={data.severeCount.toString()} detail="Prioritize evidence, not noise" />
    </section>
    <div className="app-grid">
      <section className="app-panel"><div className="app-panel__header"><div><h2>Finding ledger</h2><p>Observed signals are recommendations until an experiment verifies the outcome.</p></div><SourceBadge source="estimated" /></div><div className="app-panel__body">{data.rows.length === 0 ? <EmptyState title="No findings yet" body="Findings appear when real run evidence satisfies a deterministic rule. An empty state is not a claim that current routes are optimal." href="/app/runs" action="Inspect run ledger" /> : <div className="finding-list">{data.rows.slice(0, 40).map((finding) => <article className="finding finding--evidence" key={finding.id}><div className="finding__top"><div><span className="finding__rule">{finding.ruleId}</span><h3>{finding.title}</h3></div><StatusBadge status={finding.severity} /></div><p>{finding.recommendation}</p><div className="finding__meta"><span><strong>Project</strong>{finding.projectName}</span><span><strong>Agent</strong>{finding.agentName}</span><span><strong>Confidence</strong>{finding.confidence}</span><span><strong>Est. cost</strong><Money value={finding.estimatedWasteUsdValue} /></span></div><details className="finding__details"><summary>Evidence & verification</summary><p><strong>Evidence:</strong> {JSON.stringify(finding.evidence)}</p><p><strong>How to verify:</strong> {finding.verificationRecipe}</p><p><Link href={`/app/runs/${encodeURIComponent(finding.runId)}`}>Open run receipt →</Link></p></details></article>)}</div>}</div></section>
      <section className="app-panel"><div className="app-panel__header"><div><h2>Rules firing most often</h2><p>Frequency is diagnostic context, not a severity ranking.</p></div></div><div className="app-panel__body">{data.byRule.length ? <div className="breakdown-list">{data.byRule.slice(0, 10).map((row) => <div className="breakdown-row" key={row.ruleId}><span>{row.ruleId.replaceAll("_", " ")}</span><div className="breakdown-row__bar"><span style={{ width: `${Math.max(4, row.count / data.total * 100)}%` }} /></div><strong>{row.count}</strong></div>)}</div> : <EmptyState mark="—" title="No rule distribution" body="There is not enough finding evidence to rank recurring patterns." />}</div></section>
    </div>
  </>;
}
