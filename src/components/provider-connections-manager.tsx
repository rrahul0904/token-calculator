"use client";

import { useCallback, useEffect, useState } from "react";

type ProviderName = "openai" | "anthropic" | "gemini";
type Connection = { id: string; provider: ProviderName; label: string; status: string; lastVerifiedAt: string | null; createdAt: string };

const PROVIDERS: Array<{ id: ProviderName; name: string; hint: string }> = [
  { id: "openai", name: "OpenAI", hint: "Server-side API key. Verified with the Models API before storage." },
  { id: "anthropic", name: "Claude / Anthropic", hint: "Server-side API key. Verified with the Models API before storage." },
  { id: "gemini", name: "Gemini", hint: "Google AI API key. Verified with the Models API before storage." },
];

export function ProviderConnectionsManager() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [provider, setProvider] = useState<ProviderName>("openai");
  const [label, setLabel] = useState("Production");
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/provider-connections", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) setConnections(body?.data ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect() {
    if (!credential.trim()) return;
    setBusy("create");
    setMessage("Verifying credential with the provider…");
    try {
      const response = await fetch("/api/v1/provider-connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, label, credential }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Connection failed");
      setCredential("");
      setMessage(`${PROVIDERS.find((item) => item.id === provider)?.name ?? provider} verified and connected.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setBusy(null);
    }
  }

  async function verify(id: string) {
    setBusy(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/provider-connections/${encodeURIComponent(id)}`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.data?.detail ?? body?.detail ?? body?.error ?? "Verification failed");
      setMessage("Provider connection verified.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/provider-connections/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Delete failed");
      setMessage("Provider connection removed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Provider connections</h2><p>Credentials are verified before storage, encrypted server-side, and never returned to the browser.</p></div></div>
    <div className="app-panel__body app-stack">
      <div className="integration-grid">
        {connections.length === 0 ? <div className="app-empty"><strong>No providers connected.</strong><p>Connect a provider to make the governed gateway usable. No generation request is needed for credential verification.</p></div> : connections.map((connection) => <article className="integration-card" key={connection.id}>
          <div className="integration-card__top"><div><h3>{PROVIDERS.find((item) => item.id === connection.provider)?.name ?? connection.provider}</h3><p>{connection.label}</p></div><span className={`status-badge status-badge--${connection.status === "verified" ? "success" : "neutral"}`}>{connection.status}</span></div>
          <p className="app-muted">{connection.lastVerifiedAt ? `Verified ${new Date(connection.lastVerifiedAt).toLocaleString()}` : "Not verified"}</p>
          <div className="app-actions"><button type="button" className="button button--ghost" disabled={busy === connection.id} onClick={() => void verify(connection.id)}>Verify</button><button type="button" className="button button--ghost" disabled={busy === connection.id} onClick={() => void remove(connection.id)}>Remove</button></div>
        </article>)}
      </div>

      <div className="app-form-grid">
        <label><span>Provider</span><select value={provider} onChange={(event) => setProvider(event.target.value as ProviderName)}>{PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{PROVIDERS.find((item) => item.id === provider)?.hint}</small></label>
        <label><span>Label</span><input value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} placeholder="Production" /></label>
        <label className="app-form-grid__wide"><span>Provider API key</span><input type="password" autoComplete="off" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder="Paste a server-side provider key" /><small>The plaintext value exists only for this submission. It is verified, encrypted, and cleared from this form.</small></label>
      </div>
      <div className="app-actions"><button type="button" className="button button--primary" onClick={() => void connect()} disabled={busy === "create" || credential.length < 8}>{busy === "create" ? "Verifying…" : "Verify & connect"}</button>{message ? <span className="app-muted" role="status">{message}</span> : null}</div>
    </div>
  </section>;
}
