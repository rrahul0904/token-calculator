import Link from "next/link";
import { notFound } from "next/navigation";
import { AppPageHeader, EmptyState, Money, SourceBadge, StatusBadge } from "@/components/app-ui";
import { getTenantContext } from "@/lib/auth/session";
import { getRunDetail } from "@/lib/app-data";

function num(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokens(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en", { notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  const { runId } = await params;
  const data = await getRunDetail(tenant.organizationId, decodeURIComponent(runId));
  if (!data) notFound();

  const { run, turns, llmCalls, toolCalls, outcome, decisions, findings } = data;
  const totalTokens = run.freshInputTokens + run.cacheReadTokens + run.cacheWriteTokens + run.reasoningTokens + run.outputTokens;

  return (
    <>
      <AppPageHeader
        kicker="Run receipt"
        title={run.id}
        description={`${run.agentName}${run.workflowName ? ` · ${run.workflowName}` : ""}${run.repo ? ` · ${run.repo}` : ""}`}
        actions={<><SourceBadge source={run.usageSource} /><StatusBadge status={run.status} /><Link className="button button--ghost" href="/app/runs">Back to runs</Link></>}
      />

      <section className="receipt-summary" aria-label="Run summary">
        <div className="receipt-stat"><span>Cost</span><strong><Money value={run.displayCost} /></strong></div>
        <div className="receipt-stat"><span>Tokens</span><strong>{tokens(totalTokens)}</strong></div>
        <div className="receipt-stat"><span>Turns</span><strong>{run.turnCount}</strong></div>
        <div className="receipt-stat"><span>Tools</span><strong>{run.toolCallCount}</strong></div>
        <div className="receipt-stat"><span>Retries</span><strong>{run.retryCount}</strong></div>
        <div className="receipt-stat"><span>Fallbacks</span><strong>{run.fallbackCount}</strong></div>
      </section>

      <div className="app-stack">
        <section className="app-panel">
          <div className="app-panel__header"><div><h2>Execution waterfall</h2><p>Turns, model calls and tool activity in execution order. Raw prompt/source content is intentionally absent.</p></div></div>
          <div className="app-panel__body">
            {turns.length === 0 ? <EmptyState mark="—" title="No turn-level events" body="This run has aggregate telemetry only. Turn detail appears when the collector or gateway provides it." /> : <div className="waterfall">{turns.map((turn) => {
              const calls = llmCalls.filter((call) => call.turnId === turn.id);
              const tools = toolCalls.filter((tool) => tool.turnId === turn.id);
              return <article className="waterfall-turn" key={turn.id}>
                <div className="waterfall-turn__header"><strong>Turn {turn.turnIndex + 1}</strong><span><Money value={num(turn.costUsd)} /></span><span>{tokens(turn.freshInputTokens + turn.cacheReadTokens + turn.cacheWriteTokens + turn.reasoningTokens + turn.outputTokens)} tok</span><SourceBadge source={turn.usageSource} /><StatusBadge status={turn.status} /></div>
                <div className="waterfall-events">
                  {calls.map((call) => <div className="waterfall-event" key={call.id}><span className="waterfall-event__rail" /><strong>{call.modelResolved ?? call.modelRequested ?? "Unknown model"}</strong><small>{call.provider} · input {tokens(call.freshInputTokens)} · cache {tokens(call.cacheReadTokens)} · reasoning {tokens(call.reasoningTokens)} · output {tokens(call.outputTokens)}</small><span className="mono"><Money value={num(call.costUsd)} /></span></div>)}
                  {tools.map((tool) => <div className="waterfall-event" key={tool.id}><span className="waterfall-event__rail" /><strong>{tool.toolName}</strong><small>{tool.toolCategory} · {tool.isRetry ? "retry" : "attempt"} {tool.attemptIndex + 1} · output {tool.outputSizeBytes ?? "?"} bytes</small><StatusBadge status={tool.status} /></div>)}
                  {calls.length === 0 && tools.length === 0 && <div className="waterfall-event"><span className="waterfall-event__rail" /><strong>Aggregate turn</strong><small>No child call/tool events were supplied.</small><span /></div>}
                </div>
              </article>;
            })}</div>}
          </div>
        </section>

        <div className="app-grid">
          <section className="app-panel">
            <div className="app-panel__header"><div><h2>Findings</h2><p>Explainable waste signals with an explicit verification path.</p></div></div>
            <div className="app-panel__body">{findings.length === 0 ? <EmptyState mark="✓" title="No persisted findings" body="No deterministic finding has been persisted for this run yet. Absence of a finding is not a claim that the run was optimal." /> : <div className="finding-list">{findings.map((finding) => <div className="finding" key={finding.id}><div className="finding__top"><h3>{finding.title}</h3><StatusBadge status={finding.severity} /></div><p>{finding.recommendation}</p><p><strong>Evidence:</strong> {JSON.stringify(finding.evidence)} · <strong>Confidence:</strong> {finding.confidence}</p><p><strong>Verify:</strong> {finding.verificationRecipe}</p></div>)}</div>}</div>
          </section>

          <div className="app-stack">
            <section className="app-panel"><div className="app-panel__header"><div><h2>Outcome</h2><p>Spend is only useful when tied to a result.</p></div></div><div className="app-panel__body">{outcome ? <div className="finding-list"><div className="finding"><div className="finding__top"><h3>{outcome.status}</h3><StatusBadge status={outcome.status} /></div><p>Task completed: {String(outcome.taskCompleted ?? "unknown")} · Tests passed: {String(outcome.testsPassed ?? "unknown")} · CI: {String(outcome.ciPassed ?? "unknown")}</p>{outcome.commitSha && <p>Commit: <span className="mono">{outcome.commitSha}</span></p>}{outcome.prNumber && <p>PR #{outcome.prNumber} · merged: {String(outcome.merged ?? "unknown")}</p>}</div></div> : <EmptyState mark="?" title="Outcome not verified" body="The run has no linked task/CI/PR outcome. Cost reduction should not be called a win until success is verified." />}</div></section>
            <section className="app-panel"><div className="app-panel__header"><div><h2>Policy decisions</h2><p>Why the control plane allowed, warned or blocked activity.</p></div></div><div className="app-panel__body">{decisions.length === 0 ? <EmptyState mark="—" title="No decisions recorded" body="Runs that pass through budget checks or the gateway will include durable decision receipts here." /> : <div className="finding-list">{decisions.map((decision) => <div className="finding" key={decision.id}><div className="finding__top"><h3>{decision.action}</h3><span className="mono"><Money value={num(decision.observedCostUsd)} /></span></div><p>{decision.reason}</p></div>)}</div>}</div></section>
          </div>
        </div>
      </div>
    </>
  );
}
