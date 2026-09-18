import Link from "next/link";
import { AppPageHeader, DataTruthStrip, EmptyState, MetricCard, Money, SourceBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getOutcomeEconomicsData } from "@/lib/design-dashboard-data";

function pct(value: number, total: number) {
  return total ? `${(value / total * 100).toFixed(1)}%` : "—";
}

export default async function OutcomesPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const data = await getOutcomeEconomicsData(tenant.organizationId);

  return <>
    <AppPageHeader
      kicker="Outcome economics"
      title="Outcomes"
      description="Connect AI run spend to high-confidence engineering outcomes without turning weak associations or estimated spend into verified ROI."
      actions={<><Link className="button button--ghost" href="/app/runs">Inspect runs</Link><Link className="button button--primary" href="/app/experiments">Verify an optimization</Link></>}
    />
    <DataTruthStrip />
    <section className="metric-grid">
      <MetricCard label="Attributed runs" value={data.attributedRuns.toLocaleString()} detail={`${data.highConfidenceRuns} high-confidence associations`} />
      <MetricCard tone="good" label="Merged PRs" value={data.mergedPullRequests.toLocaleString()} detail="Unique repo + PR among high-confidence outcomes" eyebrow="observed outcome" />
      <MetricCard label="Known attributed AI cost" value={<Money value={data.knownAttributedCostUsd} />} detail={`${data.knownCostRuns} runs with actual or reconciled cost`} eyebrow="actual / reconciled" />
      <MetricCard label="Known cost / merged PR" value={<Money value={data.knownCostPerMergedPrUsd} />} detail="Only high-confidence merged associations; estimated-only runs excluded" eyebrow="derived observed" />
    </section>

    <div className="app-grid">
      <section className="app-panel">
        <div className="app-panel__header"><div><h2>Outcome evidence</h2><p>Counts below use high-confidence run-to-outcome associations only.</p></div><SourceBadge source="historically_observed" /></div>
        <div className="app-panel__body">
          {data.attributedRuns === 0 ? <EmptyState title="No outcome receipts yet" body="Token Intelligence already accepts outcome receipts for task completion, tests, CI, pull requests, merges and deployment success. Connect those signals to runs to unlock outcome economics." href="/developers" action="Open developer docs" /> :
          <div className="breakdown-list">
            <div className="breakdown-row"><span>Merged pull requests</span><div className="breakdown-row__bar"><span style={{ width: pct(data.mergedPullRequests, Math.max(data.mergedPullRequests, 1)) }} /></div><strong>{data.mergedPullRequests}</strong></div>
            <div className="breakdown-row"><span>CI-passed runs</span><div className="breakdown-row__bar"><span style={{ width: pct(data.ciPassedRuns, data.highConfidenceRuns) }} /></div><strong>{data.ciPassedRuns}</strong></div>
            <div className="breakdown-row"><span>Tests-passed runs</span><div className="breakdown-row__bar"><span style={{ width: pct(data.testsPassedRuns, data.highConfidenceRuns) }} /></div><strong>{data.testsPassedRuns}</strong></div>
            <div className="breakdown-row"><span>Task-completed runs</span><div className="breakdown-row__bar"><span style={{ width: pct(data.taskCompletedRuns, data.highConfidenceRuns) }} /></div><strong>{data.taskCompletedRuns}</strong></div>
            <div className="breakdown-row"><span>Successful-deployment linked runs</span><div className="breakdown-row__bar"><span style={{ width: pct(data.deploymentLinkedRuns, data.highConfidenceRuns) }} /></div><strong>{data.deploymentLinkedRuns}</strong></div>
          </div>}
        </div>
      </section>

      <section className="app-panel">
        <div className="app-panel__header"><div><h2>Evidence quality</h2><p>Uncertain attribution and estimated-only cost stay visible instead of being silently promoted into ROI.</p></div></div>
        <div className="app-panel__body">
          <div className="finding-list">
            <div className="finding"><div className="finding__top"><h3>Association confidence</h3><SourceBadge source="historically_observed" /></div><p>{data.highConfidenceRuns} of {data.attributedRuns} attributed runs meet the ≥0.80 confidence boundary. {data.lowOrUnknownConfidenceRuns} remain excluded from outcome unit economics.</p></div>
            <div className="finding"><div className="finding__top"><h3>Cost evidence</h3><SourceBadge source="reconciled" /></div><p>{data.knownCostRuns} runs have actual or reconciled cost. {data.estimatedOnlyRuns} are estimated-only and {data.unknownCostRuns} have no usable cost evidence.</p></div>
            <div className="finding"><div className="finding__top"><h3>Deployment unit</h3><SourceBadge source="historically_observed" /></div><p><Money value={data.knownCostPerDeploymentLinkedRunUsd} /> per high-confidence run linked to a successful deployment. This is deliberately not labeled cost per unique deployment until a stable deployment identity is present.</p></div>
          </div>
        </div>
      </section>
    </div>

    <section className="app-panel">
      <div className="app-panel__header"><div><h2>Agent outcome economics</h2><p>Use this to identify where outcome coverage is strong enough for controlled optimization, not to rank developers or agents.</p></div></div>
      {data.agents.length === 0 ? <div className="app-panel__body"><EmptyState title="No agent outcome evidence" body="Outcome analytics appear after run and outcome receipts share a stable run ID." /></div> :
      <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Agent</th><th>Attributed runs</th><th>High confidence</th><th>Successful outcomes</th><th>Known AI cost</th></tr></thead><tbody>{data.agents.map((agent) => <tr key={agent.agentName}><td>{agent.agentName}</td><td>{agent.attributedRuns}</td><td>{agent.highConfidenceRuns}</td><td>{agent.successfulRuns}</td><td className="mono"><Money value={agent.knownCostUsd} /></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
