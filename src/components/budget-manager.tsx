"use client";

import { useState } from "react";

export function BudgetManager() {
  const [name, setName] = useState("Run spend guardrail");
  const [limit, setLimit] = useState(5);
  const [period, setPeriod] = useState<"run" | "day" | "week" | "month">("run");
  const [hardStop, setHardStop] = useState(true);
  const [state, setState] = useState<string | null>(null);

  async function create() {
    setState("Saving…");
    const response = await fetch("/api/v1/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "budget", name, scopeType: "organization", period, limitUsd: limit, warnAtPct: 80, hardStop, enabled: true }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setState(body.error ?? "Create failed");
    setState("Budget created");
    window.location.reload();
  }

  return <div className="form-grid"><div className="form-row"><label htmlFor="budget-name">Name</label><input id="budget-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="form-row"><label htmlFor="budget-period">Period</label><select id="budget-period" value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="run">Per run</option><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></div><div className="form-row"><label htmlFor="budget-limit">USD limit</label><input id="budget-limit" type="number" min="0.01" step="0.01" value={limit} onChange={(event) => setLimit(Number(event.target.value) || 0)} /></div><label className="form-row"><span>Enforcement</span><select value={hardStop ? "hard" : "warn"} onChange={(event) => setHardStop(event.target.value === "hard")}><option value="hard">Hard stop</option><option value="warn">Warn only</option></select></label><div className="form-actions"><button className="button button--primary" type="button" onClick={create}>Create budget</button>{state && <span className="source-badge">{state}</span>}</div></div>;
}
