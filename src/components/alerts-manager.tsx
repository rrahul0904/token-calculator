"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/app-ui";

const EVENT_TYPES = ["budget.warned", "budget.blocked", "run.killed", "fallback.approval_required", "provider.connection_failed", "gateway.quota_exceeded"] as const;
type Endpoint = { id: string; name: string; eventTypes: string[]; enabled: boolean; lastDeliveredAt: string | null; lastFailureAt: string | null; createdAt: string };

export function AlertsManager({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Endpoint[]>([]);
  const [name, setName] = useState("Engineering alerts");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["budget.blocked", "run.killed", "fallback.approval_required"]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/alerts/endpoints", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) setRows(body?.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function toggleEvent(value: string) { setEvents((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]); }

  async function create() {
    setBusy("create"); setMessage(null);
    try {
      const response = await fetch("/api/v1/alerts/endpoints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, url, eventTypes: events }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Alert endpoint could not be created");
      setUrl(""); setMessage("Signed webhook destination saved. The URL is encrypted and will not be shown again."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Alert endpoint could not be created"); }
    finally { setBusy(null); }
  }

  async function setEnabled(row: Endpoint, enabled: boolean) {
    setBusy(row.id); setMessage(null);
    try {
      const response = await fetch(`/api/v1/alerts/endpoints/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Update failed");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Update failed"); }
    finally { setBusy(null); }
  }

  async function remove(row: Endpoint) {
    setBusy(row.id); setMessage(null);
    try {
      const response = await fetch(`/api/v1/alerts/endpoints/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Delete failed");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Delete failed"); }
    finally { setBusy(null); }
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Alert delivery</h2><p>Deliver metadata-only events to an HTTPS webhook with HMAC signatures, bounded retries and SSRF protection.</p></div></div>
    <div className="app-panel__body app-stack">
      {rows.length ? <div className="integration-grid">{rows.map((row) => <article className="integration-card" key={row.id}><div className="integration-card__top"><div><h3>{row.name}</h3><p>{row.eventTypes.length ? row.eventTypes.join(", ") : "All supported alert types"}</p></div><StatusBadge status={row.enabled ? "active" : "disabled"} /></div><p>{row.lastDeliveredAt ? `Last delivered ${new Date(row.lastDeliveredAt).toLocaleString()}` : row.lastFailureAt ? `Last failure ${new Date(row.lastFailureAt).toLocaleString()}` : "No delivery attempts yet"}</p>{canManage ? <div className="form-actions"><button className="button button--ghost" type="button" disabled={busy === row.id} onClick={() => void setEnabled(row, !row.enabled)}>{row.enabled ? "Disable" : "Enable"}</button><button className="button button--ghost" type="button" disabled={busy === row.id} onClick={() => void remove(row)}>Remove</button></div> : null}</article>)}</div> : <p>No alert destinations configured.</p>}
      {canManage ? <><div className="form-grid"><div className="form-row"><label htmlFor="alert-name">Name</label><input id="alert-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="form-row"><label htmlFor="alert-url">HTTPS destination</label><input id="alert-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/hooks/token-intelligence" /><small>Private/link-local destinations are rejected. The URL is encrypted after validation.</small></div></div><div className="form-row"><label>Events</label><div className="form-actions" style={{ flexWrap: "wrap" }}>{EVENT_TYPES.map((event) => <label key={event}><input type="checkbox" checked={events.includes(event)} onChange={() => toggleEvent(event)} /> {event}</label>)}</div></div><div className="form-actions"><button className="button button--primary" type="button" disabled={busy === "create" || !url} onClick={() => void create()}>{busy === "create" ? "Saving…" : "Add signed webhook"}</button>{message ? <small role="status">{message}</small> : null}</div></> : null}
    </div>
  </section>;
}
