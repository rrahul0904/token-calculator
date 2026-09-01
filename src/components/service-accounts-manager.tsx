"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/app-ui";

type ServiceAccount = { id: string; name: string; revokedAt: string | null; createdAt: string };

export function ServiceAccountsManager({ canManage }: { canManage: boolean }) {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/service-accounts", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) setAccounts(body?.data ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/service-accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error === "PLAN_UPGRADE_REQUIRED" ? "Service accounts require Team or Enterprise." : body?.error ?? "Unable to create service account");
      setName("");
      setMessage("Service account created. Create a scoped API key and attach it to this identity before automation use.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create service account");
    } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/service-accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Unable to revoke service account");
      setMessage("Service account and its attached API keys were revoked.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke service account");
    } finally { setBusy(false); }
  }

  return <section className="app-panel"><div className="app-panel__header"><div><h2>Service accounts</h2><p>Non-human identities for CI, agents, and production workloads. Revocation cascades to attached API keys.</p></div></div><div className="app-panel__body app-stack">
    {accounts.length ? <div className="app-table-wrap"><table className="app-table"><thead><tr><th>Name</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><strong>{account.name}</strong><br/><small className="mono">{account.id}</small></td><td><StatusBadge status={account.revokedAt ? "revoked" : "active"} /></td><td>{new Date(account.createdAt).toLocaleDateString()}</td><td>{canManage && !account.revokedAt ? <button type="button" className="button button--ghost" disabled={busy} onClick={() => void revoke(account.id)}>Revoke</button> : "—"}</td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-state__icon">SA</div><h3>No service accounts</h3><p>Create one for CI or agent workloads that should not use a developer’s personal API key.</p></div>}
    {canManage ? <div className="form-grid"><div className="form-row"><label htmlFor="service-account-name">New service account</label><input id="service-account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Production agent gateway" /></div><div className="form-actions"><button type="button" className="button button--primary" disabled={busy || name.trim().length < 2} onClick={() => void create()}>Create service account</button>{message ? <small role="status">{message}</small> : null}</div></div> : null}
  </div></section>;
}
