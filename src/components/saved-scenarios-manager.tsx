"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Scenario = { id: string; name: string; scenario: Record<string, unknown>; updatedAt: string; promptHashA: string | null; promptHashB: string | null };
type ApiBody = { data?: unknown; error?: string };

async function body(response: Response): Promise<ApiBody | null> {
  return response.json().catch(() => null) as Promise<ApiBody | null>;
}

export function SavedScenariosManager() {
  const router = useRouter();
  const [items, setItems] = useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [rename, setRename] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/scenarios", { cache: "no-store" });
    const result = await body(response);
    if (!response.ok) return;
    const next = (result?.data ?? []) as Scenario[];
    setItems(next);
    setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? "");
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setRename(selected?.name ?? ""); }, [selected]);

  async function mutate(action: "rename" | "duplicate" | "delete") {
    if (!selected) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/v1/scenarios/${encodeURIComponent(selected.id)}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: action === "delete" ? undefined : { "content-type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify(action === "duplicate" ? { duplicate: true, name: `${selected.name} copy` } : { name: rename }),
      });
      const result = await body(response);
      if (!response.ok) throw new Error(String(result?.error ?? `${action} failed`));
      setMessage(action === "delete" ? "Scenario deleted." : action === "duplicate" ? "Scenario duplicated." : "Scenario renamed.");
      await load(); router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scenario action failed");
    } finally {
      setBusy(false);
    }
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Saved scenario history</h2><p>Durable economics assumptions and prompt hashes only. Raw prompt content is never reconstructed or retained.</p></div></div>
    <div className="app-panel__body app-stack">
      {items.length === 0 ? <p>No saved scenarios yet. Save one from Prompt A / B above.</p> : <>
        <div className="form-row"><label htmlFor="saved-scenario-select">Saved scenario</label><select id="saved-scenario-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{items.map((item) => <option value={item.id} key={item.id}>{item.name} · {new Date(item.updatedAt).toLocaleString()}</option>)}</select></div>
        {selected ? <>
          <div className="form-row"><label htmlFor="saved-scenario-name">Name</label><input id="saved-scenario-name" value={rename} onChange={(event) => setRename(event.target.value)} /></div>
          <div className="form-actions"><button className="button button--ghost" disabled={busy || rename.trim().length < 2} type="button" onClick={() => void mutate("rename")}>Rename</button><button className="button button--ghost" disabled={busy} type="button" onClick={() => void mutate("duplicate")}>Duplicate</button><button className="button button--ghost" disabled={busy} type="button" onClick={() => void mutate("delete")}>Delete</button></div>
          <div className="finding"><div className="finding__top"><div><strong>Stored assumptions</strong><p className="mono">{JSON.stringify(selected.scenario)}</p></div></div></div>
        </> : null}
      </>}
      <small role="status">{message}</small>
    </div>
  </section>;
}
