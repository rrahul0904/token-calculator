"use client";

import { useEffect, useState } from "react";

type Retention = { telemetryDays: number; runDays: number; findingDays: number; auditDays: number; enabled: boolean };
const DEFAULTS: Retention = { telemetryDays: 90, runDays: 365, findingDays: 365, auditDays: 730, enabled: true };

export function RetentionSettings({ canManage }: { canManage: boolean }) {
  const [value, setValue] = useState<Retention>(DEFAULTS);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/v1/settings/retention", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (response.ok && body?.data) setValue({
          telemetryDays: body.data.telemetryDays ?? 90,
          runDays: body.data.runDays ?? 365,
          findingDays: body.data.findingDays ?? 365,
          auditDays: body.data.auditDays ?? 730,
          enabled: body.data.enabled ?? true,
        });
      });
  }, []);

  async function save() {
    setBusy(true);
    setStatus("Saving…");
    try {
      const response = await fetch("/api/v1/settings/retention", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Retention update failed");
      setStatus("Retention policy saved. The daily enforcement job will use these windows.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Retention update failed");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof Omit<Retention, "enabled">, label: string, min = 1) => <div className="form-row"><label htmlFor={`retention-${key}`}>{label}</label><input id={`retention-${key}`} type="number" min={min} max={3650} disabled={!canManage || busy} value={value[key]} onChange={(event) => setValue((current) => ({ ...current, [key]: Number(event.target.value) }))} /></div>;

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Retention enforcement</h2><p>Metadata categories have independent deletion windows. Prompt/code persistence remains disabled separately by default.</p></div></div>
    <div className="app-panel__body form-grid">
      <div className="integration-grid">
        {field("telemetryDays", "Telemetry days")}
        {field("runDays", "Run receipt days")}
        {field("findingDays", "Finding days")}
        {field("auditDays", "Audit days", 30)}
      </div>
      <label className="scope-option"><input type="checkbox" disabled={!canManage || busy} checked={value.enabled} onChange={(event) => setValue((current) => ({ ...current, enabled: event.target.checked }))} /><span>Enable scheduled retention deletion</span></label>
      <div className="form-actions">{canManage ? <button type="button" className="button button--primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save retention"}</button> : null}{status ? <small role="status">{status}</small> : null}</div>
    </div>
  </section>;
}
