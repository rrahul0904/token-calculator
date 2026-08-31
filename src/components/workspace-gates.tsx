"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function WorkspaceConfigurationGate({ database, auth }: { database: string; auth: string }) {
  return (
    <div className="config-page">
      <section className="config-card">
        <span className="app-kicker">Production configuration</span>
        <h1>The workspace is code-complete but not configured.</h1>
        <p>The public calculator stays available without infrastructure. The authenticated Agent Economics workspace requires both PostgreSQL and WorkOS before it can store tenant-scoped telemetry.</p>
        <div className="config-list">
          <div className="config-row"><span>PostgreSQL</span><code>{database}</code></div>
          <div className="config-row"><span>WorkOS AuthKit</span><code>{auth}</code></div>
        </div>
        <div className="form-actions">
          <Link className="button button--primary" href="/">Use free calculator</Link>
          <Link className="button button--ghost" href="/developers">Deployment setup</Link>
        </div>
      </section>
    </div>
  );
}

export function WorkspaceOnboarding() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [projectName, setProjectName] = useState("My first project");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const response = await fetch("/api/v1/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationName, projectName }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof body.error === "string" ? body.error : "ONBOARDING_FAILED");
      setSaving(false);
      return;
    }
    router.push("/app/overview");
    router.refresh();
  }

  return (
    <div className="config-page">
      <form className="config-card form-grid" onSubmit={submit}>
        <span className="app-kicker">Create workspace</span>
        <h1>Connect your first AI economics workspace.</h1>
        <p>This creates the tenant boundary used for projects, agent runs, API keys, budgets, and billing. Prompt and source content remain disabled by default.</p>
        <div className="form-row"><label htmlFor="organization-name">Organization</label><input id="organization-name" required minLength={2} maxLength={120} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Acme Engineering" /></div>
        <div className="form-row"><label htmlFor="project-name">First project</label><input id="project-name" required minLength={2} maxLength={120} value={projectName} onChange={(event) => setProjectName(event.target.value)} /></div>
        {error && <p className="warning">{error}</p>}
        <button className="button button--primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create workspace"}</button>
      </form>
    </div>
  );
}
