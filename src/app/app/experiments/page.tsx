import { AppPageHeader, DataTruthStrip, EmptyState, MetricCard, Money, SourceBadge, StatusBadge } from "@/components/app-ui";
import { ExperimentsManager } from "@/components/experiments-manager";
import { VerifiedSavingsButton } from "@/components/verified-savings-button";
import { getTenantContext, roleCan } from "@/lib/auth/session";
import { getExperimentsDashboardData } from "@/lib/design-dashboard-data";

function pct(value: number | null) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }
function percentValue(value: number | null) { return value === null ? "—" : `${value.toFixed(1)}%`; }
function latency(value: number | null) { return value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`; }

export default async function ExperimentsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const data = await getExperimentsDashboardData(tenant.organizationId);
  const completed = data.items.filter((item) => item.resultCount > 0).length;
  const canManage = roleCan(tenant.role, "scenarios:write");

  return <>
    <AppPageHeader
      kicker="Outcome verification"
      title="Experiments"
      description="Benchmark complete agent sessions on paired evaluation cases. Verified savings require authoritative run-linked economics, explicit cache/tool-call accounting, preserved quality and success, and lower cost."
    />
    <DataTruthStrip />
    <section className="metric-grid">
      <MetricCard label="Experiments" value={data.items.length.toString()} detail={`${completed} with recorded results`} />
      <MetricCard label="Evaluation datasets" value={data.datasetCount.toString()} detail="Versioned paired workloads" />
      <MetricCard tone="good" label="Result observations" value={data.resultCount.toLocaleString()} detail="Session cost + quality evidence where recorded" eyebrow="experiment evidence" />
      <MetricCard tone="policy" label="Verified savings snapshots" value={data.verifiedSavingsCount.toLocaleString()} detail="Only paired, full-session, quality-preserving cost wins" eyebrow="versioned evidence" />
      <MetricCard label="Revalidation checks" value={data.revalidationCount.toLocaleString()} detail="Append-only evidence freshness checks" eyebrow="scheduled evidence" />
    </section>

    <ExperimentsManager canManage={canManage} />

    {data.items.length === 0 ? (
      <section className="app-panel">
        <div className="app-panel__body">
          <EmptyState
            title="No experiments yet"
            body="Create a versioned evaluation dataset and compare the same cases across baseline and candidate sessions. Until paired, run-linked evidence exists, optimization remains estimated or historically observed."
          />
        </div>
      </section>
    ) : (
      <div className="app-stack">
        {data.items.map((item) => {
          const integrity = item.benchmarkIntegrity;
          return (
            <section className="app-panel" key={item.id}>
              <div className="app-panel__header">
                <div>
                  <h2>{item.name}</h2>
                  <p>{item.dataset ? `${item.dataset.name} · dataset v${item.dataset.version}` : "Dataset metadata unavailable"}</p>
                </div>
                <div className="app-header-actions">
                  <StatusBadge status={item.status} />
                  <SourceBadge source={item.evidence} />
                  <VerifiedSavingsButton experimentId={item.id} canManage={canManage} eligible={item.evidence === "experiment_verified"} />
                </div>
              </div>
              <div className="app-panel__body">
                {item.variants.length === 0 ? (
                  <EmptyState mark="—" title="Experiment configured; results pending" body="No result rows have been recorded, so the UI does not infer a winner." />
                ) : (
                  <>
                    <p>
                      {item.evidence === "experiment_verified"
                        ? "This evidence uses the same paired cases for both variants, complete run-linked session economics, cache/tool-call accounting, and the required quality/success gates."
                        : "Results are recorded, but they remain unverified until the same cases are paired across variants and every observation has authoritative full-session economics plus cache/tool-call accounting."}
                    </p>

                    <div className="finding">
                      <div className="finding__top">
                        <div>
                          <strong>Benchmark integrity</strong>
                          <p>
                            {integrity.pairedCaseCount} paired cases · {integrity.authoritativeFullSessionCount}/{item.resultCount} full-session observations · {integrity.cacheAccountingCount}/{item.resultCount} cache-accounted · {integrity.toolCallAccountingCount}/{item.resultCount} tool-accounted
                          </p>
                          <p>
                            Tool invocation rate: {pct(integrity.toolInvocationRate)} · index/setup time reported for {integrity.indexTimeReportedCount}/{item.resultCount} observations ({pct(integrity.indexTimeCoverage)}).
                          </p>
                        </div>
                      </div>
                    </div>

                    {item.latestVerifiedSavings ? (
                      <div className="finding">
                        <div className="finding__top">
                          <div>
                            <strong>Verified savings v{item.latestVerifiedSavings.version}</strong>
                            <p>
                              <Money value={item.latestVerifiedSavings.savingsPerObservationUsd} /> per evaluated observation · {percentValue(item.latestVerifiedSavings.savingsPct)} lower median cost · {item.latestVerifiedSavings.baselineSampleSize}/{item.latestVerifiedSavings.candidateSampleSize} baseline/candidate samples
                            </p>
                            {item.latestRevalidation ? (
                              <p><strong>Latest revalidation:</strong> {item.latestRevalidation.status.replaceAll("_", " ")} · {item.latestRevalidation.checkedAt.toISOString()}</p>
                            ) : <p>No revalidation check recorded yet.</p>}
                          </div>
                          <SourceBadge source="experiment_verified" />
                        </div>
                      </div>
                    ) : null}

                    <div className="app-table-wrap">
                      <table className="app-table">
                        <thead>
                          <tr>
                            <th>Variant</th>
                            <th>Cases</th>
                            <th>Success</th>
                            <th>Median quality</th>
                            <th>Median session cost</th>
                            <th>Median latency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.variants.map((variant) => (
                            <tr key={variant.variant}>
                              <td>{variant.variant}</td>
                              <td>{variant.count}</td>
                              <td>{pct(variant.successRate)}</td>
                              <td className="mono">{variant.medianQuality === null ? "—" : variant.medianQuality.toFixed(3)}</td>
                              <td className="mono"><Money value={variant.medianCostUsd} /></td>
                              <td className="mono">{latency(variant.medianLatencyMs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    )}
  </>;
}
