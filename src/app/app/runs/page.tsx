import Link from "next/link";
import { AppPageHeader, DataTruthStrip, EmptyState, MetricCard, Money, SourceBadge, StatusBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getRunsData } from "@/lib/app-data";

function formatTokens(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatDuration(start: Date, end: Date | null) {
  if (!end) return "—";
  const ms = Math.max(0, end.getTime() - start.getTime());
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; source?: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const [runs, query] = await Promise.all([getRunsData(tenant.organizationId, 250), searchParams]);
  const q = (query.q ?? "").trim().toLowerCase();
  const status = query.status ?? "";
  const source = query.source ?? "";

  const filteredRuns = runs.filter((run) => {
    const matchesQuery = !q || [run.id, run.projectName, run.agentName, run.agentVendor ?? "", run.outcomeStatus ?? ""].some((value) => value.toLowerCase().includes(q));
    const matchesStatus = !status || run.status === status;
    const matchesSource = !source || run.usageSource === source;
    return matchesQuery && matchesStatus && matchesSource;
  });

  const totalKnownCost = filteredRuns.reduce((sum, run) => sum + (run.displayCost ?? 0), 0);
  const totalTokens = filteredRuns.reduce((sum, run) => sum + run.freshInputTokens + run.cacheReadTokens + run.cacheWriteTokens + run.reasoningTokens + run.outputTokens, 0);
  const failedRuns = filteredRuns.filter((run) => ["failed", "aborted", "cancelled", "budget_blocked"].includes(run.status)).length;
  const statusOptions = [...new Set(runs.map((run) => run.status))].sort();
  const sourceOptions = [...new Set(runs.map((run) => run.usageSource))].sort();

  return (
    <>
      <AppPageHeader kicker="Execution ledger" title="Agent Runs" description="Every run is an economic receipt: who triggered it, which models and tools it used, where it retried or fell back, what it cost, and what outcome followed." actions={<><Link className="button button--ghost" href="/app/integrations">Add collector</Link><Link className="button button--primary" href="/app/cost-lab">Compare economics</Link></>} />
      <DataTruthStrip />

      <section className="metric-grid" aria-label="Filtered run economics">
        <MetricCard label="Visible runs" value={filteredRuns.length.toString()} detail={`${runs.length} loaded into this ledger`} />
        <MetricCard tone="cost" label="Known spend" value={`$${totalKnownCost.toFixed(2)}`} detail="Unknown-cost runs are not treated as $0" />
        <MetricCard label="Tokens" value={formatTokens(totalTokens)} detail="Fresh + cache + reasoning + output" />
        <MetricCard tone={failedRuns ? "risk" : "good"} label="Failed / blocked" value={failedRuns.toString()} detail="Current filtered set" />
      </section>

      <section className="app-panel">
        <div className="app-panel__header">
          <div><h2>Run history</h2><p>{runs.length ? `${filteredRuns.length} matching · ${runs.length} most recent loaded` : "No telemetry has been ingested."}</p></div>
        </div>
        <form className="run-filter-bar" method="get" aria-label="Filter agent runs">
          <label className="run-search"><span>Search</span><input name="q" defaultValue={query.q ?? ""} placeholder="Run ID, project, agent…" /></label>
          <label><span>Status</span><select name="status" defaultValue={status}><option value="">All statuses</option>{statusOptions.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          <label><span>Usage source</span><select name="source" defaultValue={source}><option value="">All evidence</option>{sourceOptions.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          <button className="button button--ghost" type="submit">Apply filters</button>
          {(q || status || source) && <Link className="run-filter-clear" href="/app/runs">Clear</Link>}
        </form>

        {runs.length === 0 ? <EmptyState title="Your run ledger is empty" body="Use a local coding-agent collector, MCP explicit recording, SDK instrumentation, or the gateway. Estimated Cursor usage remains labeled separately." href="/app/integrations" action="Connect a source" /> : filteredRuns.length === 0 ? <EmptyState mark="0" title="No runs match these filters" body="Change the search, status, or evidence source. The underlying telemetry has not been modified." href="/app/runs" action="Clear filters" /> : (
          <div className="app-table-wrap"><table className="app-table runs-table"><thead><tr><th>Run</th><th>Project</th><th>Agent</th><th>Status</th><th>Outcome</th><th>Tokens</th><th>Cost</th><th>Retries</th><th>Fallbacks</th><th>Duration</th><th>Source</th><th>Started</th></tr></thead><tbody>{filteredRuns.map((run) => {
            const rowTokens = run.freshInputTokens + run.cacheReadTokens + run.cacheWriteTokens + run.reasoningTokens + run.outputTokens;
            return <tr key={run.id}><td className="mono"><Link href={`/app/runs/${encodeURIComponent(run.id)}`}>{run.id.slice(0, 18)}</Link></td><td>{run.projectName}</td><td>{run.agentName}</td><td><StatusBadge status={run.status} /></td><td><StatusBadge status={run.outcomeStatus ?? "unverified"} /></td><td className="mono">{formatTokens(rowTokens)}</td><td className="mono"><Money value={run.displayCost} /></td><td>{run.retryCount}</td><td>{run.fallbackCount}</td><td>{formatDuration(run.startedAt, run.endedAt)}</td><td><SourceBadge source={run.usageSource} /></td><td>{run.startedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td></tr>;
          })}</tbody></table></div>
        )}
      </section>
    </>
  );
}
