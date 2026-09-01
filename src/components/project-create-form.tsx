"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createProject() {
    if (name.trim().length < 2) return;
    setBusy(true);
    setMessage("Creating project…");
    try {
      const response = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description: description.trim() || null }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Project creation failed");
      setName("");
      setDescription("");
      setMessage("Project created.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project creation failed");
    } finally {
      setBusy(false);
    }
  }

  return <section className="app-panel">
    <div className="app-panel__header"><div><h2>Create project</h2><p>Projects isolate attribution, keys, budgets and run history inside the organization.</p></div></div>
    <div className="app-panel__body form-grid">
      <div className="form-row"><label htmlFor="project-name">Name</label><input id="project-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Customer support agent" /></div>
      <div className="form-row"><label htmlFor="project-description">Description</label><textarea id="project-description" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="What this project measures and controls." /></div>
      <div className="form-actions"><button type="button" className="button button--primary" disabled={busy || name.trim().length < 2} onClick={() => void createProject()}>{busy ? "Creating…" : "Create project"}</button>{message ? <small role="status">{message}</small> : null}</div>
    </div>
  </section>;
}
