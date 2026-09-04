import Link from "next/link";
import type { Metadata } from "next";
import { getPublicSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Developers — Token Intelligence",
  description: "Token Intelligence REST, MCP, SDK, and governed gateway integration documentation.",
  alternates: { canonical: "/developers" },
};

const tools = ["estimate_cost", "compare_models", "check_context", "recommend_model", "check_budget", "record_usage", "get_usage", "get_project_spend", "get_run", "find_savings", "explain_cost"];

export default function DevelopersPage() {
  const siteUrl = getPublicSiteUrl();
  return <main className="page-shell shell">
    <section className="page-hero"><p className="eyebrow">Developer platform</p><h1>Put AI economics inside your tools.</h1><p>Use the REST API for applications, Streamable HTTP MCP for coding agents, local collectors for run receipts, and the governed gateway when you need hard budget enforcement.</p><div className="form-actions"><Link className="button button--primary" href="/openapi.json">OpenAPI 3.1</Link><Link className="button button--ghost" href="/pricing">Plans</Link></div></section>

    <div className="docs-grid">
      <section className="tool-card"><p className="eyebrow">REST</p><h2>Preflight + telemetry</h2><pre><code>{`curl ${siteUrl}/api/v1/estimate \\
  -H "Content-Type: application/json" \\
  -d '{"inputTokens":12000,"outputTokens":1200}'`}</code></pre><p className="muted">Public economics endpoints stay usable for acquisition workflows. Tenant data endpoints require a scoped Token Intelligence API key or an authenticated workspace session as documented in OpenAPI.</p></section>
      <section className="tool-card"><p className="eyebrow">MCP</p><h2>Remote agent tools</h2><pre><code>{`Endpoint: ${siteUrl}/mcp
Authorization: Bearer ti_live_...`}</code></pre><p className="muted">MCP is advisory unless the model call itself passes through the governed gateway. It does not magically observe unrelated Codex, Claude Code, Cursor, or Antigravity traffic.</p></section>
      <section className="tool-card"><p className="eyebrow">Gateway</p><h2>Enforce before spend</h2><pre><code>{`POST /api/gateway/openai
POST /api/gateway/anthropic
POST /api/gateway/gemini`}</code></pre><p className="muted">Gateway requests evaluate tenant/project/key quotas and hierarchical policies before provider execution, then preserve measured usage, retry/fallback lineage, and cost certainty.</p></section>
      <section className="tool-card"><p className="eyebrow">SDKs</p><h2>TypeScript + Python</h2><pre><code>{`const ti = new TokenIntelligenceClient({ apiKey });
await ti.budgets.check(...);
await ti.runs.get(runId);`}</code></pre><p className="muted">SDK sources live under <code>packages/sdk-typescript</code> and <code>packages/sdk-python</code>. Secrets are sent only in Authorization headers and are never logged by the client.</p></section>
    </div>

    <section className="tool-card docs-section"><p className="eyebrow">MCP tool surface</p><h2>Economics and control without another dashboard tab.</h2><p className="muted">{tools.join(" · ")}</p></section>

    <section className="tool-card docs-section"><p className="eyebrow">Collection precision</p><h2>Measured and estimated data never get silently mixed.</h2><div className="trust-grid"><div><strong>Codex</strong><h3>Agent measured</h3><p>Local session usage is normalized when observable token counters are available.</p></div><div><strong>Claude Code</strong><h3>Agent measured</h3><p>Cache read/write and model usage are preserved when present in local session records.</p></div><div><strong>Cursor</strong><h3>Estimated</h3><p>Cursor remains explicitly estimated where provider-billed token values are not available.</p></div></div></section>

    <section className="tool-card docs-section"><p className="eyebrow">Privacy boundary</p><h2>Different integration modes have different data paths.</h2><p>The public calculator tokenizes locally in the browser. Local collectors keep raw transcripts local and upload normalized metadata when sync is enabled. REST/MCP process what the caller explicitly sends. The gateway necessarily sees provider request content in transit, but does not persist prompts, completions, source code, or raw tool output by default.</p></section>
  </main>;
}
