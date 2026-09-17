"use client";

import { useEffect, useMemo, useState } from "react";
import { parseWorkloadQuery, resolveScenarioEstimate, type WorkloadScenario } from "@/lib/economics/workload";

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unknown";
  return value < 0.01 ? "$" + value.toFixed(4) : "$" + value.toFixed(2);
}

export function ImportedWorkloadPanel() {
  const [scenario, setScenario] = useState<WorkloadScenario | null>(null);
  const [name, setName] = useState("Imported workload plan");
  const [saveState, setSaveState] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("model") || params.has("tokens") || params.has("budget")) setScenario(parseWorkloadQuery(params));
  }, []);

  const estimate = useMemo(() => scenario ? resolveScenarioEstimate(scenario) : null, [scenario]);
  if (!scenario || !estimate) return null;

  async function save() {
    setSaveState("Saving…");
    const response = await fetch("/api/v1/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        scenario: {
          workload: scenario,
          createdFrom: "public_workload_lab",
          promptContentStored: false,
        },
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaveState(response.ok ? "Saved as version 1" : String(body.error ?? "Save failed"));
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Imported workload plan</h2><p>This deep link contains planning metadata only. No prompt content is imported or stored.</p></div></div>
    <div className="app-panel__body">
      <div className="cost-lab-delta">
        <div><span>Model</span><strong>{estimate.modelName}</strong></div>
        <div><span>Request cost</span><strong>{money(estimate.cost.totalUsd)}</strong></div>
        <div><span>Monthly forecast</span><strong>{money(estimate.monthlyCostUsd)}</strong></div>
      </div>
      <div className="scenario-save">
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Imported scenario name" />
        <button className="button button--primary" type="button" onClick={save}>Save workload scenario</button>
        <span aria-live="polite">{saveState}</span>
      </div>
    </div>
  </section>;
}
