"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/app-ui";

type PrivacyMode = { mode: string; available: boolean; reason: string };
type DataControls = {
  privacyMode: string;
  privacyModes: PrivacyMode[];
  requestedDataRegion: string | null;
  configuredDataRegion: string | null;
  deploymentDataRegion: string | null;
  regionStatus: string;
  residencyClaim: string;
};

export function DataControlsSettings({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<DataControls | null>(null);
  const [requestedRegion, setRequestedRegion] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/v1/settings/data-controls", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      setData(body.data);
      setRequestedRegion(body.data.requestedDataRegion ?? "");
    } else setMessage(body?.error ?? "Unable to load data controls.");
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/v1/settings/data-controls", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ privacyMode: "metadata_only", requestedDataRegion: requestedRegion.trim() || null }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Update failed");
      setData(body.data);
      setMessage("Data controls updated. No residency claim is made unless requested, configured, and deployment regions all match.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    } finally { setBusy(false); }
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Privacy mode & data region</h2><p>Production truth only: unavailable content modes stay disabled, and residency is never inferred from a preference.</p></div>{data ? <StatusBadge status={data.regionStatus} /> : null}</div>
    <div className="app-panel__body app-stack">
      {!data ? <p>{message ?? "Loading data controls…"}</p> : <>
        <div className="integration-grid">
          {data.privacyModes.map((mode) => <article className="integration-card" key={mode.mode}><div className="integration-card__top"><div><h3>{mode.mode.replaceAll("_", " ")}</h3><p>{mode.reason}</p></div><StatusBadge status={mode.mode === data.privacyMode ? "active" : mode.available ? "available" : "unavailable"} /></div></article>)}
        </div>
        <div className="config-list">
          <div className="config-row"><span>Requested region</span><code>{data.requestedDataRegion ?? "none"}</code></div>
          <div className="config-row"><span>Configured region</span><code>{data.configuredDataRegion ?? "not configured"}</code></div>
          <div className="config-row"><span>Deployment region</span><code>{data.deploymentDataRegion ?? "not verified"}</code></div>
          <div className="config-row"><span>Residency claim</span><code>{data.residencyClaim}</code></div>
        </div>
        {canManage ? <div className="form-grid"><div className="form-row"><label htmlFor="requested-region">Requested data region</label><input id="requested-region" value={requestedRegion} maxLength={80} onChange={(event) => setRequestedRegion(event.target.value)} placeholder="e.g. us-east-2" /><small>This is a preference only. Token Intelligence marks residency verified only when actual configured and deployment regions match it.</small></div><div className="form-actions"><button type="button" className="button button--primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save data controls"}</button>{message ? <small role="status">{message}</small> : null}</div></div> : null}
      </>}
    </div>
  </section>;
}
