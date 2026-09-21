import Link from "next/link";
import { AppPageHeader, DataTruthStrip, EmptyState, MetricCard, Money, SourceBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getRouteLabData } from "@/lib/design-dashboard-data";

function pct(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function latency(value: number | null) {
  return value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

export default async function RouteLabPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;

  const data = await getRouteLabData(tenant.organizationId);
  const observed = data.cohorts.filter((cohort) => cohort.evidence === "historically_observed");
  const orchestration = data.orchestration;

  return <>
    <AppPageHeader
      kicker="Historical optimization"
      title="Route Lab"
      description="Compare provider/model cohorts and governed orchestration roles using actual historical evidence. Low-sample or incomplete economics stay explicitly inconclusive."
      actions={<>
        <Link className="button button--ghost" href="/app/findings">View findings</Link>
        <Link className="button button--primary" href="/app/experiments">Run controlled experiment</Link>
      </>}
    />
    <DataTruthStrip />

    <section className="metric-grid">
      <MetricCard label="LLM calls analyzed" value={data.totalCalls.toLocaleString()} detail="Last 45 days, bounded query" />
      <MetricCard label="Runs represented" value={data.totalRuns.toLocaleString()} detail="Outcome evidence source" />
      <MetricCard tone="good" label="Observed cohorts" value={data.observedCohorts.toString()} detail="At least 5 comparable runs" eyebrow="historically observed" />
      <MetricCard label="Inconclusive cohorts" value={(data.cohorts.length - data.observedCohorts).toString()} detail="Shown, but never promoted as a recommendation" />
    </section>

    <section className="app-panel">
      <div className="app-panel__header">
        <div>
          <h2>Orchestration economics</h2>
          <p>Planner, executor, and reviewer costs come from governed gateway receipts. This view does not claim savings versus a baseline; savings still require controlled experiment evidence.</p>
        </div>
        <SourceBadge source={orchestration.reconciledRunCount === orchestration.runCount && orchestration.runCount > 0 ? "reconciled" : "unavailable"} />
      </div>
      {orchestration.runCount === 0 ? (
        <div className="app-panel__body">
          <EmptyState
            title="No orchestration receipts yet"
            body="Run a governed orchestration assignment through the gateway to populate planner, executor, and reviewer economics."
            href="/app/integrations"
            action="Review gateway setup"
          />
        </div>
      ) : (
        <>
          <div className="app-panel__body">
            <section className="metric-grid">
              <MetricCard label="Orchestration runs" value={orchestration.runCount.toLocaleString()} detail={`${orchestration.callCount.toLocaleString()} role-attributed calls`} />
              <MetricCard tone="good" label="Fully reconciled runs" value={orchestration.reconciledRunCount.toLocaleString()} detail="Every attributed call has authoritative cost" />
              <MetricCard label="Reconciled role cost" value={orchestration.reconciledTotalCostUsd === null ? "Unknown" : `$${orchestration.reconciledTotalCostUsd.toFixed(2)}`} detail="Only fully reconciled orchestration runs" />
              <MetricCard label="Executor cost share" value={pct(orchestration.executorCostShare)} detail="Share of reconciled orchestration spend, not a savings percentage" />
            </section>
          </div>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Orchestration run</th>
                  <th>Tasks</th>
                  <th>Planner</th>
                  <th>Executor</th>
                  <th>Reviewer</th>
                  <th>Corrections</th>
                  <th>Total cost</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {orchestration.runs.slice(0, 20).map((run) => (
                  <tr key={run.orchestrationRunId}>
                    <td className="mono">{run.orchestrationRunId}</td>
                    <td>{run.taskCount}</td>
                    <td>{run.planner.callCount} calls · <Money value={run.planner.costUsd} /></td>
                    <td>{run.executor.callCount} calls · <Money value={run.executor.costUsd} /></td>
                    <td>{run.reviewer.callCount} calls · <Money value={run.reviewer.costUsd} /></td>
                    <td>{run.correctionCycles}</td>
                    <td className="mono"><Money value={run.totalCostUsd} /></td>
                    <td><SourceBadge source={run.evidence} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>

    <section className="app-panel">
      <div className="app-panel__header">
        <div>
          <h2>Route evidence</h2>
          <p>Price alone never determines the preferred route. Success evidence remains beside cost and latency.</p>
        </div>
        <SourceBadge source="historically_observed" />
      </div>
      {data.cohorts.length === 0 ? (
        <div className="app-panel__body">
          <EmptyState
            title="No route history yet"
            body="Route Lab needs model-call telemetry tied to run outcomes. Connect a collector or use the governed gateway first."
            href="/app/integrations"
            action="Connect telemetry"
          />
        </div>
      ) : (
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th>Comparable runs</th>
                <th>Success rate</th>
                <th>Median call cost</th>
                <th>Median latency</th>
                <th>Retry rate</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((cohort) => (
                <tr key={`${cohort.provider}:${cohort.model}`}>
                  <td>{cohort.provider}</td>
                  <td className="mono">{cohort.model}</td>
                  <td>{cohort.runCount}</td>
                  <td>{pct(cohort.successRate)}</td>
                  <td className="mono"><Money value={cohort.medianCallCostUsd} /></td>
                  <td className="mono">{latency(cohort.medianLatencyMs)}</td>
                  <td>{pct(cohort.retryRate)}</td>
                  <td><SourceBadge source={cohort.evidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    {observed.length >= 2 ? (
      <section className="app-panel">
        <div className="app-panel__header">
          <div>
            <h2>What this evidence can support</h2>
            <p>Observed differences can generate an experiment candidate. They are not a quality guarantee or verified savings claim.</p>
          </div>
        </div>
        <div className="app-panel__body">
          <div className="finding-list">
            <div className="finding">
              <div className="finding__top">
                <h3>Controlled comparison is available</h3>
                <SourceBadge source="counterfactual_estimate" />
              </div>
              <p>{observed.length} route cohorts meet the minimum sample threshold. Use the same versioned evaluation dataset to test a candidate before enforcing a route change.</p>
              <p><Link href="/app/experiments">Open experiments →</Link></p>
            </div>
          </div>
        </div>
      </section>
    ) : null}
  </>;
}
