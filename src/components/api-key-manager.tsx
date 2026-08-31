"use client";

import { useEffect, useState } from "react";

type KeyRow = {
  id: string;
  name: string;
  environment: string;
  prefix: string;
  lastFour: string;
  scopes: string[];
  projectId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const DEFAULT_SCOPES = ["read:models", "read:usage", "read:runs", "write:events", "write:runs", "read:budgets", "mcp:tools"];

export function ApiKeyManager() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("Developer key");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [scopes, setScopes] = useState<string[]>(["read:models", "read:usage", "read:runs"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/v1/api-keys", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setKeys(body.data ?? []);
    else setStatus(body.error ?? "Unable to load API keys");
  }

  useEffect(() => { void refresh(); }, []);

  async function create() {
    setSecret(null);
    setStatus("Creating…");
    const response = await fetch("/api/v1/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, environment, scopes }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setStatus(body.error ?? "Create failed");
    setSecret(body.data.secret);
    setStatus("Key created. Copy it now; it cannot be retrieved again.");
    await refresh();
  }

  async function revoke(id: string) {
    const response = await fetch(`/api/v1/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setStatus(response.ok ? "Key revoked" : body.error ?? "Revoke failed");
    if (response.ok) await refresh();
  }

  function toggleScope(scope: string) {
    setScopes((current) => current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope]);
  }

  return <div className="app-stack">
    <section className="app-panel"><div className="app-panel__header"><div><h2>Create key</h2><p>Secrets are generated with 256 bits of randomness and stored only as salted scrypt hashes.</p></div></div><div className="app-panel__body form-grid"><div className="form-row"><label htmlFor="key-name">Name</label><input id="key-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="form-row"><label htmlFor="key-env">Environment</label><select id="key-env" value={environment} onChange={(event) => setEnvironment(event.target.value as "live" | "test")}><option value="live">Live</option><option value="test">Test</option></select></div><div className="form-row"><span>Scopes</span><div className="scope-grid">{DEFAULT_SCOPES.map((scope) => <label key={scope} className="scope-option"><input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} /><span>{scope}</span></label>)}</div></div><div className="form-actions"><button className="button button--primary" type="button" disabled={!scopes.length} onClick={create}>Create API key</button>{status && <span className="source-badge">{status}</span>}</div>{secret && <div className="secret-once"><span>Secret · shown once</span><code>{secret}</code><button type="button" className="button button--ghost" onClick={() => navigator.clipboard.writeText(secret)}>Copy</button></div>}</div></section>

    <section className="app-panel"><div className="app-panel__header"><div><h2>Keys</h2><p>Only non-sensitive prefixes and the final four characters remain visible.</p></div></div>{keys.length === 0 ? <div className="empty-state"><div className="empty-state__icon">KEY</div><h3>No API keys</h3><p>Create a scoped key for SDK, collector, CI or MCP access.</p></div> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Name</th><th>Key</th><th>Environment</th><th>Scopes</th><th>Last used</th><th>Status</th><th /></tr></thead><tbody>{keys.map((key) => <tr key={key.id}><td>{key.name}</td><td className="mono">{key.prefix}…{key.lastFour}</td><td>{key.environment}</td><td><small>{key.scopes.join(", ")}</small></td><td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</td><td>{key.revokedAt ? "Revoked" : "Active"}</td><td>{!key.revokedAt && <button className="button button--ghost" type="button" onClick={() => revoke(key.id)}>Revoke</button>}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
