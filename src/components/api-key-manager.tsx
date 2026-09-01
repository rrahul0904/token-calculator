"use client";

import { useEffect, useState } from "react";

type ProjectRow = { id: string; name: string; archivedAt: string | null };
type ServiceAccountRow = { id: string; name: string; revokedAt: string | null };
type KeyRow = {
  id: string;
  name: string;
  environment: string;
  prefix: string;
  lastFour: string;
  scopes: string[];
  projectId: string | null;
  serviceAccountId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  requestsPerMinute: number | null;
  monthlyTokenLimit: number | null;
  monthlyCostLimitUsd: string | null;
  quotaEnabled: boolean | null;
};

const DEFAULT_SCOPES = ["read:models", "read:usage", "read:runs", "write:events", "write:runs", "read:budgets", "write:budgets", "mcp:tools", "gateway:invoke"];

export function ApiKeyManager() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccountRow[]>([]);
  const [name, setName] = useState("Developer key");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [projectId, setProjectId] = useState("");
  const [serviceAccountId, setServiceAccountId] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read:models", "read:usage", "read:runs"]);
  const [requestsPerMinute, setRequestsPerMinute] = useState(120);
  const [monthlyTokenLimit, setMonthlyTokenLimit] = useState("");
  const [monthlyCostLimitUsd, setMonthlyCostLimitUsd] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [secretLabel, setSecretLabel] = useState("Secret · shown once");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingQuota, setEditingQuota] = useState<string | null>(null);
  const [quotaRpm, setQuotaRpm] = useState(120);
  const [quotaTokens, setQuotaTokens] = useState("");
  const [quotaCost, setQuotaCost] = useState("");

  async function refresh() {
    const [keyResponse, projectResponse, serviceResponse] = await Promise.all([
      fetch("/api/v1/api-keys", { cache: "no-store" }),
      fetch("/api/v1/projects", { cache: "no-store" }),
      fetch("/api/v1/service-accounts", { cache: "no-store" }),
    ]);
    const [keyBody, projectBody, serviceBody] = await Promise.all([
      keyResponse.json().catch(() => ({})),
      projectResponse.json().catch(() => ({})),
      serviceResponse.json().catch(() => ({})),
    ]);
    if (keyResponse.ok) setKeys(keyBody.data ?? []);
    else setStatus(keyBody.error ?? "Unable to load API keys");
    if (projectResponse.ok) setProjects((projectBody.data ?? []).filter((project: ProjectRow) => !project.archivedAt));
    if (serviceResponse.ok) setServiceAccounts((serviceBody.data ?? []).filter((account: ServiceAccountRow) => !account.revokedAt));
  }

  useEffect(() => { void refresh(); }, []);

  async function create() {
    setSecret(null);
    setBusy("create");
    setStatus("Creating…");
    const response = await fetch("/api/v1/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        environment,
        projectId: projectId || null,
        serviceAccountId: serviceAccountId || null,
        scopes,
        requestsPerMinute,
        monthlyTokenLimit: monthlyTokenLimit ? Number(monthlyTokenLimit) : null,
        monthlyCostLimitUsd: monthlyCostLimitUsd ? Number(monthlyCostLimitUsd) : null,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setStatus(body.error ?? "Create failed");
    setSecret(body.data.secret);
    setSecretLabel("New key · shown once");
    setStatus("Key created. Copy it now; it cannot be retrieved again.");
    await refresh();
  }

  async function rotate(id: string) {
    setBusy(`rotate:${id}`);
    setSecret(null);
    const response = await fetch(`/api/v1/api-keys/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rotate" }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setStatus(body.error ?? "Rotation failed");
    setSecret(body.data.secret);
    setSecretLabel("Rotated key · shown once");
    setStatus("Key rotated. The previous secret is invalid now.");
    await refresh();
  }

  async function revoke(id: string) {
    setBusy(`revoke:${id}`);
    const response = await fetch(`/api/v1/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    setStatus(response.ok ? "Key revoked" : body.error ?? "Revoke failed");
    if (response.ok) await refresh();
  }

  function beginQuota(key: KeyRow) {
    setEditingQuota(key.id);
    setQuotaRpm(key.requestsPerMinute ?? 120);
    setQuotaTokens(key.monthlyTokenLimit?.toString() ?? "");
    setQuotaCost(key.monthlyCostLimitUsd ?? "");
  }

  async function saveQuota(id: string) {
    setBusy(`quota:${id}`);
    const response = await fetch(`/api/v1/api-keys/${encodeURIComponent(id)}/quota`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestsPerMinute: quotaRpm,
        monthlyTokenLimit: quotaTokens ? Number(quotaTokens) : null,
        monthlyCostLimitUsd: quotaCost ? Number(quotaCost) : null,
        enabled: true,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setStatus(body.error ?? "Quota update failed");
    setEditingQuota(null);
    setStatus("Quota updated.");
    await refresh();
  }

  function toggleScope(scope: string) {
    setScopes((current) => current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope]);
  }

  const projectName = (id: string | null) => id ? projects.find((project) => project.id === id)?.name ?? id : "Organization-wide";
  const identityName = (id: string | null) => id ? serviceAccounts.find((account) => account.id === id)?.name ?? id : "User key";

  return <div className="app-stack">
    <section className="app-panel"><div className="app-panel__header"><div><h2>Create key</h2><p>Secrets use 256 bits of randomness and are stored only as salted scrypt hashes. Project, service-account and quota restrictions are enforced server-side.</p></div></div><div className="app-panel__body form-grid">
      <div className="form-row"><label htmlFor="key-name">Name</label><input id="key-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="form-row"><label htmlFor="key-env">Environment</label><select id="key-env" value={environment} onChange={(event) => setEnvironment(event.target.value as "live" | "test")}><option value="live">Live</option><option value="test">Test</option></select></div>
      <div className="form-row"><label htmlFor="key-project">Project restriction</label><select id="key-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Organization-wide</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
      <div className="form-row"><label htmlFor="key-service-account">Identity</label><select id="key-service-account" value={serviceAccountId} onChange={(event) => setServiceAccountId(event.target.value)}><option value="">Personal / user key</option>{serviceAccounts.map((account) => <option key={account.id} value={account.id}>Service account · {account.name}</option>)}</select><small>Service-account keys require Team or Enterprise and owner/admin access.</small></div>
      <div className="form-row"><span>Scopes</span><div className="scope-grid">{DEFAULT_SCOPES.map((scope) => <label key={scope} className="scope-option"><input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} /><span>{scope}</span></label>)}</div></div>
      <div className="integration-grid">
        <div className="form-row"><label htmlFor="key-rpm">Requests / minute</label><input id="key-rpm" type="number" min={1} max={10000} value={requestsPerMinute} onChange={(event) => setRequestsPerMinute(Number(event.target.value))} /></div>
        <div className="form-row"><label htmlFor="key-token-quota">Monthly token quota</label><input id="key-token-quota" type="number" min={1} value={monthlyTokenLimit} onChange={(event) => setMonthlyTokenLimit(event.target.value)} placeholder="Unlimited" /></div>
        <div className="form-row"><label htmlFor="key-cost-quota">Monthly cost quota (USD)</label><input id="key-cost-quota" type="number" min="0.01" step="0.01" value={monthlyCostLimitUsd} onChange={(event) => setMonthlyCostLimitUsd(event.target.value)} placeholder="Unlimited" /></div>
      </div>
      <div className="form-actions"><button className="button button--primary" type="button" disabled={!scopes.length || busy === "create"} onClick={() => void create()}>{busy === "create" ? "Creating…" : "Create API key"}</button>{status && <span className="source-badge">{status}</span>}</div>
      {secret && <div className="secret-once"><span>{secretLabel}</span><code>{secret}</code><button type="button" className="button button--ghost" onClick={() => navigator.clipboard.writeText(secret)}>Copy</button></div>}
    </div></section>

    <section className="app-panel"><div className="app-panel__header"><div><h2>Keys</h2><p>Only non-sensitive prefixes and the final four characters remain visible.</p></div></div>{keys.length === 0 ? <div className="empty-state"><div className="empty-state__icon">KEY</div><h3>No API keys</h3><p>Create a scoped key for SDK, collector, CI, MCP or governed gateway access.</p></div> : <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Name</th><th>Key</th><th>Identity</th><th>Project</th><th>Scopes</th><th>Quota</th><th>Last used</th><th>Status</th><th /></tr></thead><tbody>{keys.map((key) => <><tr key={key.id}><td>{key.name}<br /><small>{key.environment}</small></td><td className="mono">{key.prefix}…{key.lastFour}</td><td><small>{identityName(key.serviceAccountId)}</small></td><td><small>{projectName(key.projectId)}</small></td><td><small>{key.scopes.join(", ")}</small></td><td><small>{key.requestsPerMinute ?? 120}/min<br />{key.monthlyTokenLimit ? `${key.monthlyTokenLimit.toLocaleString()} tok/mo` : "tokens unlimited"}<br />{key.monthlyCostLimitUsd ? `$${Number(key.monthlyCostLimitUsd).toFixed(2)}/mo` : "cost unlimited"}</small></td><td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</td><td>{key.revokedAt ? "Revoked" : key.quotaEnabled === false ? "Quota disabled" : "Active"}</td><td>{!key.revokedAt && <div className="form-actions"><button className="button button--ghost" type="button" disabled={busy !== null} onClick={() => beginQuota(key)}>Quota</button><button className="button button--ghost" type="button" disabled={busy !== null} onClick={() => void rotate(key.id)}>{busy === `rotate:${key.id}` ? "Rotating…" : "Rotate"}</button><button className="button button--ghost" type="button" disabled={busy !== null} onClick={() => void revoke(key.id)}>Revoke</button></div>}</td></tr>{editingQuota === key.id && !key.revokedAt ? <tr key={`${key.id}:quota`}><td colSpan={9}><div className="integration-grid"><div className="form-row"><label>Requests / minute</label><input type="number" min={1} max={10000} value={quotaRpm} onChange={(event) => setQuotaRpm(Number(event.target.value))} /></div><div className="form-row"><label>Monthly token quota</label><input type="number" min={1} value={quotaTokens} onChange={(event) => setQuotaTokens(event.target.value)} placeholder="Unlimited" /></div><div className="form-row"><label>Monthly cost quota (USD)</label><input type="number" min="0.01" step="0.01" value={quotaCost} onChange={(event) => setQuotaCost(event.target.value)} placeholder="Unlimited" /></div></div><div className="form-actions" style={{ marginTop: 10 }}><button type="button" className="button button--primary" disabled={busy === `quota:${key.id}`} onClick={() => void saveQuota(key.id)}>Save quota</button><button type="button" className="button button--ghost" onClick={() => setEditingQuota(null)}>Cancel</button></div></td></tr> : null}</>)}</tbody></table></div>}</section>
  </div>;
}
