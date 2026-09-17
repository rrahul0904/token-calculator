"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Approval = { id: string; status: string; effectiveStatus: string; reason: string | null; runId: string | null; policyId: string | null; expiresAt: string | null };
type ApiBody = { data?: unknown; error?: string };

async function read(response: Response): Promise<ApiBody | null> {
  return response.json().catch(() => null) as Promise<ApiBody | null>;
}

export function PolicyApprovalManager({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [policyName, setPolicyName] = useState("Run safety policy");
  const [maxCost, setMaxCost] = useState("5");
  const [maxTurns, setMaxTurns] = useState("50");
  const [maxRetries, setMaxRetries] = useState("3");
  const [maxToolCalls, setMaxToolCalls] = useState("100");
  const [disableFallback, setDisableFallback] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadApprovals = useCallback(async () => {
    const response = await fetch("/api/v1/approvals", { cache: "no-store" });
    const body = await read(response);
    if (response.ok) setApprovals((body?.data ?? []) as Approval[]);
  }, []);

  useEffect(() => { void loadApprovals(); }, [loadApprovals]);

  async function createPolicy() {
    setBusy(true); setMessage(null);
    try {
      const rules: Record<string, number | boolean> = {};
      const cost = Number(maxCost); const turns = Number(maxTurns); const retries = Number(maxRetries); const tools = Number(maxToolCalls);
      if (Number.isFinite(cost) && cost >= 0) rules.maxCostUsd = cost;
      if (Number.isInteger(turns) && turns >= 0) rules.maxTurns = turns;
      if (Number.isInteger(retries) && retries >= 0) rules.maxRetries = retries;
      if (Number.isInteger(tools) && tools >= 0) rules.maxToolCalls = tools;
      if (disableFallback) rules.disableFallback = true;
      const response = await fetch("/api/v1/budgets", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "policy", name: policyName, scopeType: "organization", priority: 100, enabled: true, rules }),
      });
      const body = await read(response);
      if (!response.ok) throw new Error(String(body?.error ?? "Policy creation failed"));
      setMessage("Policy created and ready for pre-call enforcement."); router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Policy creation failed");
    } finally { setBusy(false); }
  }

  async function decide(id: string, status: "approved" | "denied") {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/v1/approvals", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status, reason: `Reviewed in Token Intelligence control plane: ${status}` }),
      });
      const body = await read(response);
      if (!response.ok) throw new Error(String(body?.error ?? "Approval decision failed"));
      setMessage(`Approval ${status}.`); await loadApprovals(); router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval decision failed");
    } finally { setBusy(false); }
  }

  return <div className="app-stack">
    <section className="app-panel"><div className="app-panel__header"><div><h2>Create policy</h2><p>Author deterministic organization guardrails for cost, turns, retries, tools and fallback behavior.</p></div></div><div className="app-panel__body">
      {canManage ? <div className="form-grid">
        <div className="form-row"><label htmlFor="policy-name">Name</label><input id="policy-name" value={policyName} onChange={(event) => setPolicyName(event.target.value)} /></div>
        <div className="form-row"><label htmlFor="policy-cost">Max cost USD</label><input id="policy-cost" type="number" min="0" step="0.01" value={maxCost} onChange={(event) => setMaxCost(event.target.value)} /></div>
        <div className="form-row"><label htmlFor="policy-turns">Max turns</label><input id="policy-turns" type="number" min="0" value={maxTurns} onChange={(event) => setMaxTurns(event.target.value)} /></div>
        <div className="form-row"><label htmlFor="policy-retries">Max retries</label><input id="policy-retries" type="number" min="0" value={maxRetries} onChange={(event) => setMaxRetries(event.target.value)} /></div>
        <div className="form-row"><label htmlFor="policy-tools">Max tool calls</label><input id="policy-tools" type="number" min="0" value={maxToolCalls} onChange={(event) => setMaxToolCalls(event.target.value)} /></div>
        <label className="form-row"><span>Fallback</span><select value={disableFallback ? "disabled" : "allowed"} onChange={(event) => setDisableFallback(event.target.value === "disabled")}><option value="allowed">Allowed</option><option value="disabled">Disabled</option></select></label>
        <div className="form-actions"><button className="button button--primary" type="button" disabled={busy || policyName.trim().length < 2} onClick={() => void createPolicy()}>Create policy</button></div>
      </div> : <p>Your organization role can view policy state but cannot modify guardrails.</p>}
    </div></section>

    <section className="app-panel"><div className="app-panel__header"><div><h2>Approval queue</h2><p>Review policy escalations that require a human decision before a higher-cost or restricted action proceeds.</p></div></div><div className="app-panel__body">
      {approvals.length === 0 ? <p>No approval requests are pending or recently recorded.</p> : <div className="finding-list">{approvals.map((approval) => <div className="finding" key={approval.id}><div className="finding__top"><div><strong>{approval.effectiveStatus}</strong><p>{approval.reason ?? "No reason provided"}{approval.runId ? ` · run ${approval.runId}` : ""}</p></div>{canManage && approval.effectiveStatus === "pending" ? <div className="form-actions"><button className="button button--ghost" disabled={busy} type="button" onClick={() => void decide(approval.id, "approved")}>Approve</button><button className="button button--ghost" disabled={busy} type="button" onClick={() => void decide(approval.id, "denied")}>Deny</button></div> : null}</div></div>)}</div>}
    </div></section>
    <small role="status">{message}</small>
  </div>;
}
