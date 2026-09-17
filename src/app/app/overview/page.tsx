import Link from "next/link";
import { AppPageHeader, DataTruthStrip, EmptyState, MetricCard, Money, SourceBadge, StatusBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getOverviewData } from "@/lib/app-data";

function tokens(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function Breakdown({ rows, total }: { rows: Array<{ name: string; value: number }>; total: number | null }) {
  if (!rows.length || !total) return <EmptyState mark="—" title="No cost attribution yet" body="Cost breakdowns appear once runs contain estimated, actual, or reconciled spend." />;
  return (
    <div className="breakdown-list">
      {rows.slice(0, 6).map((row) => (
        <div className="breakdown-row" key={row.name}>
          <span>{row.name}</span>
          <div className="breakdown-row__bar"><span style={{ width: `${Math.max(2, (row.value / total) * 100)}%` }} /></div>
          <strong><Money value={row.value} /></strong>
        </div>
      ))}
    </div>
  );
}

export default async function OverviewPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const data = await getOverviewData(tenant.organizationId);
  const totalTokens = data.tokens.fresh + data.tokens.cache + data.tokens.reasoning + data.tokens.output;
  const recentRetries = data.recentRuns.reduce((sum, run) => sum + run.retries, 0);
  const recentFallbacks = data.recentRuns.reduce((sum, run) => sum + run.fallbacks, 0);

  return (
    <>
      <AppPageHeader
        kicker="Economics command center"
        title="Overview"
        description={`A ${data.periodDays}-day operating view of AI spend, token flow, run outcomes and the evidence behind every number.`}
        actions={<><Link className="button button--ghost" href="/app/integrations">Connect telemetry</Link><Link className="button button--primary" href="/app/cost-lab">Plan workload</Link></>}
      />
      <DataTruthStrip />

      <section className="metric-grid" aria-label="Economics metrics">
        <MetricCard tone="cost" label="30-day spend" value={data.spend === null ? "Unknown" : `$${data.spend.toFixed(2)}`} detail={`${data.runCount} runs observed`} eyebrow="Known cost only" />
        <MetricCard label="Tokens" value={tokens(totalTokens)} detail={`${percent(data.cacheShare)} input served from cache`} eyebrow="Observed dimensions" />
        <MetricCard tone="good" label="Successful runs" value={tokens(data.successfulRuns)} detail={data.averageCostPerSuccessfulRun === null ? "No cost-per-outcome yet" : `$${data.averageCostPerSuccessfulRun.toFixed(2)} / successful outcome`} eyebrow="Outcome linked" />
        <MetricCard tone="risk" label="Failed / aborted spend" value={data.failedSpend === null ? "Unknown" : `$${data.failedSpend.toFixed(2)}`} detail="Visible waste, never hidden in totals" warning={(data.failedSpend ?? 0) > 0} />
        <MetricCard tone="policy" label="Average cost / run" value={data.averageCostPerRun === null ? "Unknown" : `$${data.averageCostPerRun.toFixed(2)}`} detail={`${recentRetries} retries · ${recentFallbacks} fallbacks in recent runs`} eyebrow="Operational signal" />
      </section>

      <div className="app-grid">
        <div className="app-stack">
          <section className="app-panel">
            <div className="app-panel__header"><div><h2>Recent run ledger</h2><p>Measured and estimated telemetry remain visibly distinct all the way to the receipt.</p></div><Link href="/app/runs">Open ledger →</Link></div>
            {data.recentRuns.length === 0 ? <EmptyState title="No agent runs yet" body="Connect Codex, Claude Code, Cursor, Antigravity, or the telemetry API. Raw prompt and source content are not required." href="/app/integrations" action="Set up an integration" /> : (
              <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Run</th><th>Project</th><th>Agent</th><th>Status</th><th>Outcome</th><th>Source</th><th>Cost</th></tr></thead><tbody>{data.recentRuns.map((run) => <tr key={run.id}><td className="mono"><Link href={`/app/runs/${encodeURIComponent(run.id)}`}>{run.id.slice(0, 16)}</Link></td><td>{run.project}</td><td>{run.agentName}</td><td><StatusBadge status={run.status} /></td><td><StatusBadge status={run.outcomeStatus ?? "unverified"} /></td><td><SourceBadge source={run.usageSource} /></td><td className="mono"><Money value={run.displayCost} /></td></tr>)}</tbody></table></div>
            )}
          </section>

          <section className="app-panel"><div className="app-panel__header"><div><h2>Spend by project</h2><p>Attribution comes from ingestion metadata—not finance-side guessing.</p></div></div><div className="app-panel__body"><Breakdown rows={data.projectBreakdown} total={data.spend} /></div></section>
        </div>

        <div className="app-stack">
          <section className="app-panel"><div className="app-panel__header"><div><h2>Provider economics</h2><p>Known spend grouped by observed provider/agent attribution.</p></div></div><div className="app-panel__body"><Breakdown rows={data.providerBreakdown} total={data.spend} /></div></section>
          <section className="app-panel"><div className="app-panel__header"><div><h2>Agent distribution</h2><p>Which execution surfaces are creating the current spend.</p></div></div><div className="app-panel__body"><Breakdown rows={data.agentBreakdown} total={data.spend} /></div></section>
          <section className="app-panel"><div className="app-panel__header"><div><h2>Token composition</h2><p>Provider-native dimensions stay separate instead of being flattened.</p></div></div><div className="app-panel__body breakdown-list"><div className="breakdown-row"><span>Fresh input</span><div className="breakdown-row__bar"><span style={{ width: `${totalTokens ? (data.tokens.fresh / totalTokens) * 100 : 0}%` }} /></div><strong>{tokens(data.tokens.fresh)}</strong></div><div className="breakdown-row"><span>Cache read</span><div className="breakdown-row__bar"><span style={{ width: `${totalTokens ? (data.tokens.cache / totalTokens) * 100 : 0}%` }} /></div><strong>{tokens(data.tokens.cache)}</strong></div><div className="breakdown-row"><span>Reasoning</span><div className="breakdown-row__bar"><span style={{ width: `${totalTokens ? (data.tokens.reasoning / totalTokens) * 100 : 0}%` }} /></div><strong>{tokens(data.tokens.reasoning)}</strong></div><div className="breakdown-row"><span>Output</span><div className="breakdown-row__bar"><span style={{ width: `${totalTokens ? (data.tokens.output / totalTokens) * 100 : 0}%` }} /></div><strong>{tokens(data.tokens.output)}</strong></div></div></section>
        </div>
      </div>
    </>
  );
}
