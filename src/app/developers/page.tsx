import Link from "next/link";
import type { Metadata } from "next";
import { CodeExampleTabs } from "@/components/code-example-tabs";
import { getPublicSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Developers — Token Intelligence",
  description: "Token Intelligence tokenization, model metadata, pricing, comparison, SDK, MCP, and governed gateway developer documentation.",
  alternates: { canonical: "/developers" },
  openGraph: { title: "Token Intelligence developer API", description: "Tokenize, inspect model pricing, estimate cost and compare workloads through public economics APIs.", url: "/developers" },
};

const tools = ["estimate_cost", "compare_models", "check_context", "recommend_model", "check_budget", "record_usage", "get_usage", "get_project_spend", "get_run", "find_savings", "explain_cost"];

export default function DevelopersPage() {
  const siteUrl = getPublicSiteUrl();
  const tokenizeBody = JSON.stringify({ text: "hello world", model: "gpt-5.6-sol", includePieces: true, maxPieces: 100 });
  const tokenizeExamples = [
    { label: "curl", code: `curl ${siteUrl}/api/v1/tokenize -H "Content-Type: application/json" -d '${tokenizeBody}'` },
    { label: "JavaScript", code: `const response = await fetch("${siteUrl}/api/v1/tokenize", {\n  method: "POST",\n  headers: { "content-type": "application/json" },\n  body: JSON.stringify(${tokenizeBody}),\n});\nconst result = await response.json();` },
    { label: "Python", code: `import json, urllib.request\nbody = json.dumps(${JSON.stringify({ text: "hello world", model: "gpt-5.6-sol" })}).encode()\nrequest = urllib.request.Request("${siteUrl}/api/v1/tokenize", data=body, headers={"Content-Type":"application/json"})\nprint(json.load(urllib.request.urlopen(request)))` },
  ];
  const modelExamples = [
    { label: "curl", code: `curl ${siteUrl}/api/v1/models/gpt-5.6-sol` },
    { label: "JavaScript", code: `const model = await fetch("${siteUrl}/api/v1/models/gpt-5.6-sol").then(r => r.json());\nconsole.log(model.data.pricing.current);` },
    { label: "Python", code: `import json, urllib.request\nmodel = json.load(urllib.request.urlopen("${siteUrl}/api/v1/models/gpt-5.6-sol"))\nprint(model["data"]["pricing"]["current"])` },
  ];

  return <main className="page-shell shell">
    <section className="page-hero"><p className="eyebrow">Developer platform</p><h1>Put AI economics inside your tools.</h1><p>Public economics endpoints work without workspace credentials. Tenant telemetry, budgets, provider connections and governed execution remain authenticated as documented in OpenAPI.</p><div className="form-actions"><Link className="button button--primary" href="/openapi.json">OpenAPI 3.1</Link><Link className="button button--ghost" href="/models">Model catalog</Link><Link className="button button--ghost" href="/pricing">Plans</Link></div></section>

    <section className="tool-card">
      <p className="eyebrow">Public economics API</p><h2>Five useful endpoints before you create an account.</h2>
      <div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Method</th><th>Endpoint</th><th>Purpose</th><th>Authentication</th></tr></thead><tbody>
        <tr><td>POST</td><td><code>/api/v1/tokenize</code></td><td>Count text with optional model-aware precision/pieces.</td><td>Not required</td></tr>
        <tr><td>GET</td><td><code>/api/v1/models</code></td><td>List the sourced model catalog.</td><td>Not required</td></tr>
        <tr><td>GET</td><td><code>/api/v1/models/:id</code></td><td>Fetch normalized model pricing/context metadata.</td><td>Not required</td></tr>
        <tr><td>POST</td><td><code>/api/v1/estimate</code></td><td>Estimate a workload across models.</td><td>Not required</td></tr>
        <tr><td>POST</td><td><code>/api/v1/compare</code></td><td>Compare two workload scenarios.</td><td>Not required</td></tr>
      </tbody></table></div>
    </section>

    <CodeExampleTabs title="Tokenize text" examples={tokenizeExamples} />
    <CodeExampleTabs title="Fetch current model economics" examples={modelExamples} />

    <section className="tool-card docs-section">
      <p className="eyebrow">SDK source packages</p><h2>TypeScript + Python</h2>
      <div className="docs-grid">
        <div><h3>TypeScript</h3><pre><code>npm install @token-intelligence/sdk</code></pre><pre><code>{`import { TokenIntelligenceClient } from "@token-intelligence/sdk";\nconst ti = new TokenIntelligenceClient({});\nawait ti.tokenize({ text: "hello world" });\nawait ti.models.get("gpt-5.6-sol");\nawait ti.estimate({ inputTokens: 12000, outputTokens: 1200 });`}</code></pre></div>
        <div><h3>Python</h3><pre><code>pip install token-intelligence</code></pre><pre><code>{`from token_intelligence import TokenIntelligenceClient\nti = TokenIntelligenceClient()\nti.tokenize("hello world")\nti.model("gpt-5.6-sol")\nti.estimate(inputTokens=12000, outputTokens=1200)`}</code></pre></div>
      </div>
      <p className="table-note">These are the package names declared by the repository source. This page does not claim registry publication status; use the repository packages directly until a release pipeline publishes them.</p>
    </section>

    <div className="docs-grid docs-section">
      <section className="tool-card"><p className="eyebrow">REST</p><h2>Preflight + telemetry</h2><pre><code>{`curl ${siteUrl}/api/v1/estimate \\\n  -H "Content-Type: application/json" \\\n  -d '{"inputTokens":12000,"outputTokens":1200}'`}</code></pre><p className="muted">Public economics endpoints are acquisition surfaces. Tenant data endpoints require a scoped API key or authenticated workspace session.</p></section>
      <section className="tool-card"><p className="eyebrow">MCP</p><h2>Remote agent tools</h2><pre><code>{`Endpoint: ${siteUrl}/mcp\nAuthorization: Bearer ti_live_...`}</code></pre><p className="muted">MCP is advisory unless the model call itself passes through the governed gateway.</p></section>
      <section className="tool-card"><p className="eyebrow">Gateway</p><h2>Enforce before spend</h2><pre><code>{`POST /api/gateway/openai\nPOST /api/gateway/anthropic\nPOST /api/gateway/gemini`}</code></pre><p className="muted">Gateway requests evaluate tenant/project/key policy before provider execution.</p></section>
      <section className="tool-card"><p className="eyebrow">Pricing history</p><h2>Effective-date provenance</h2><pre><code>{`GET /api/v1/models/gemini-3.7-flash/pricing-history`}</code></pre><p className="muted">Only source-backed windows represented in the catalog are returned. Unknown history is not fabricated.</p></section>
    </div>

    <section className="tool-card docs-section"><p className="eyebrow">MCP tool surface</p><h2>Economics and control without another dashboard tab.</h2><p className="muted">{tools.join(" · ")}</p></section>

    <section className="tool-card docs-section"><p className="eyebrow">Privacy boundary</p><h2>Different integration modes have different data paths.</h2><p>The public calculator tokenizes locally in the browser. Public REST endpoints process only what callers explicitly send. Shareable calculator/comparison URLs contain numeric workload assumptions, never raw prompt text. Tenant collectors and governed gateway modes retain their existing documented privacy boundaries.</p></section>
  </main>;
}
