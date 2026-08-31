"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/app-ui";

type ProviderName = "openai" | "anthropic" | "gemini";
type Connection = {
  id: string;
  provider: ProviderName;
  label: string;
  status: string;
  credentialKeyVersion: number;
  lastVerifiedAt: string | null;
  createdAt: string;
};

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
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotationCredential, setRotationCredential] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/provider-connections", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) setConnections(body?.data ?? []);
    else setMessage(body?.error ?? "Unable to load provider connections.");
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

  async function rotate(id: string) {
    if (rotationCredential.length < 8) return;
    setBusy(`rotate:${id}`);
    setMessage("Verifying replacement credential before rotation…");
    try {
      const response = await fetch(`/api/v1/provider-connections/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: rotationCredential }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Rotation failed");
      setRotationCredential("");
      setRotatingId(null);
      setMessage(`Credential rotated and verified as key version ${body?.data?.credentialKeyVersion ?? "new"}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rotation failed");
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
      if (rotatingId === id) {
        setRotatingId(null);
        setRotationCredential("");
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Provider connections</h2><p>Credentials are verified before storage, encrypted server-side, versioned, and never returned to the browser.</p></div></div>
    <div className="app-panel__body app-stack">
      <div className="integration-grid">
        {connections.length === 0 ? <div className="empty-state"><div className="empty-state__icon">AI</div><h3>No providers connected</h3><p>Connect a provider to make the governed gateway usable. Credential verification uses a read-only model-list request, not a paid generation.</p></div> : connections.map((connection) => <article className="integration-card" key={connection.id}>
          <div className="integration-card__top"><div><h3>{PROVIDERS.find((item) => item.id === connection.provider)?.name ?? connection.provider}</h3><p>{connection.label}</p></div><StatusBadge status={connection.status} /></div>
          <p>{connection.lastVerifiedAt ? `Verified ${new Date(connection.lastVerifiedAt).toLocaleString()}` : "Not verified"} · key version {connection.credentialKeyVersion}</p>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button type="button" className="button button--ghost" disabled={busy === connection.id} onClick={() => void verify(connection.id)}>Verify</button>
            <button type="button" className="button button--ghost" disabled={busy !== null} onClick={() => { setRotatingId(rotatingId === connection.id ? null : connection.id); setRotationCredential(""); }}>Rotate</button>
            <button type="button" className="button button--ghost" disabled={busy === connection.id} onClick={() => void remove(connection.id)}>Remove</button>
          </div>
          {rotatingId === connection.id ? <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="form-row"><label htmlFor={`rotate-${connection.id}`}>Replacement API key</label><input id={`rotate-${connection.id}`} type="password" autoComplete="off" value={rotationCredential} onChange={(event) => setRotationCredential(event.target.value)} placeholder="Paste replacement server-side key" /><small>The existing credential remains active unless the replacement verifies successfully.</small></div>
            <div className="form-actions"><button type="button" className="button button--primary" disabled={busy === `rotate:${connection.id}` || rotationCredential.length < 8} onClick={() => void rotate(connection.id)}>{busy === `rotate:${connection.id}` ? "Verifying…" : "Verify & rotate"}</button><button type="button" className="button button--ghost" disabled={busy !== null} onClick={() => { setRotatingId(null); setRotationCredential(""); }}>Cancel</button></div>
          </div> : null}
        </article>)}
      </div>

      <div className="form-grid">
        <div className="form-row"><label htmlFor="provider">Provider</label><select id="provider" value={provider} onChange={(event) => setProvider(event.target.value as ProviderName)}>{PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{PROVIDERS.find((item) => item.id === provider)?.hint}</small></div>
        <div className="form-row"><label htmlFor="provider-label">Label</label><input id="provider-label" value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} placeholder="Production" /></div>
        <div className="form-row"><label htmlFor="provider-secret">Provider API key</label><input id="provider-secret" type="password" autoComplete="off" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder="Paste a server-side provider key" /><small>The plaintext value exists only for this submission. It is verified, encrypted, and cleared from this form.</small></div>
      </div>
      <div className="form-actions"><button type="button" className="button button--primary" onClick={() => void connect()} disabled={busy === "create" || credential.length < 8}>{busy === "create" ? "Verifying…" : "Verify & connect"}</button>{message ? <small role="status">{message}</small> : null}</div>
    </div>
  </section>;
}
