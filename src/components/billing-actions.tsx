"use client";

import { useState } from "react";

export function BillingActions({ stripeLive, plan }: { stripeLive: boolean; plan: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function checkout(targetPlan: "pro" | "team") {
    setStatus("Opening checkout…");
    const response = await fetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: targetPlan, seats: targetPlan === "team" ? 1 : undefined }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.data?.url) return setStatus(body.error ?? "Checkout unavailable");
    window.location.assign(body.data.url);
  }

  async function portal() {
    setStatus("Opening billing portal…");
    const response = await fetch("/api/v1/billing/portal", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.data?.url) return setStatus(body.error ?? "Portal unavailable");
    window.location.assign(body.data.url);
  }

  if (!stripeLive) return <div className="finding"><h3>Billing is not configured for this deployment.</h3><p>Stripe Checkout and Portal code are present, but production credentials, Price IDs and webhook secret must be configured before purchases can occur.</p></div>;

  return <div className="form-actions">{plan !== "pro" && <button className="button button--ghost" type="button" onClick={() => checkout("pro")}>Upgrade to Pro</button>}{plan !== "team" && plan !== "enterprise" && <button className="button button--primary" type="button" onClick={() => checkout("team")}>Upgrade to Team</button>}{plan !== "free" && <button className="button button--ghost" type="button" onClick={portal}>Manage billing</button>}{status && <span className="source-badge">{status}</span>}</div>;
}
