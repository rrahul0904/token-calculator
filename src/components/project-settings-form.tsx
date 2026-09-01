"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectSettingsForm({ project }: { project: { id: string; name: string; description: string | null; archivedAt: string | Date | null } }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const archived = Boolean(project.archivedAt);

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Project update failed");
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project update failed");
    } finally {
      setBusy(false);
    }
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Project settings</h2><p>Archiving stops this project from being treated as active without deleting historical receipts.</p></div></div>
    <div className="app-panel__body form-grid">
      <div className="form-row"><label htmlFor="project-detail-name">Name</label><input id="project-detail-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></div>
      <div className="form-row"><label htmlFor="project-detail-description">Description</label><textarea id="project-detail-description" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></div>
      <div className="form-actions">
        <button type="button" className="button button--primary" disabled={busy || name.trim().length < 2} onClick={() => void patch({ name, description: description.trim() || null }, "Project updated.")}>Save changes</button>
        <button type="button" className="button button--ghost" disabled={busy} onClick={() => void patch({ archived: !archived }, archived ? "Project restored." : "Project archived.")}>{archived ? "Restore project" : "Archive project"}</button>
        {message ? <small role="status">{message}</small> : null}
      </div>
    </div>
  </section>;
}
