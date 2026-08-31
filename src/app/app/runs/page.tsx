import Link from "next/link";
import { AppPageHeader, EmptyState, Money, SourceBadge, StatusBadge } from "@/components/app-ui";
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

export default async function RunsPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const runs = await getRunsData(tenant.organizationId, 150);

  return (
    <>
      <AppPageHeader kicker="Trace" title="Agent Runs" description="Every run is an economic receipt: who triggered it, which models and tools it used, where it retried or fell back, what it cost, and what outcome followed." actions={<Link className="button button--ghost" href="/app/integrations">Add collector</Link>} />
      <section className="app-panel">
        <div className="app-panel__header"><div><h2>Run history</h2><p>{runs.length ? `${runs.length} most recent runs` : "No telemetry has been ingested."}</p></div></div>
        {runs.length === 0 ? <EmptyState title="Your run ledger is empty" body="Use a local coding-agent collector, MCP explicit recording, SDK instrumentation, or the gateway. Estimated Cursor usage remains labeled separately." href="/app/integrations" action="Connect a source" /> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Run</th><th>Project</th><th>Agent</th><th>Status</th><th>Outcome</th><th>Tokens</th><th>Cost</th><th>Retries</th><th>Fallbacks</th><th>Duration</th><th>Source</th><th>Started</th></tr></thead><tbody>{runs.map((run) => {
          const totalTokens = run.freshInputTokens + run.cacheReadTokens + run.cacheWriteTokens + run.reasoningTokens + run.outputTokens;
          return <tr key={run.id}><td className="mono"><Link href={`/app/runs/${encodeURIComponent(run.id)}`}>{run.id.slice(0, 18)}</Link></td><td>{run.projectName}</td><td>{run.agentName}</td><td><StatusBadge status={run.status} /></td><td><StatusBadge status={run.outcomeStatus ?? "unverified"} /></td><td className="mono">{formatTokens(totalTokens)}</td><td className="mono"><Money value={run.displayCost} /></td><td>{run.retryCount}</td><td>{run.fallbackCount}</td><td>{formatDuration(run.startedAt, run.endedAt)}</td><td><SourceBadge source={run.usageSource} /></td><td>{run.startedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td></tr>;
        })}</tbody></table></div>}
      </section>
    </>
  );
}
