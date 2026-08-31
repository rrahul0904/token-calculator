import type { Metadata } from "next";
export const metadata: Metadata = { title: "Developer API" };
export default function DevelopersPage() {
  return <main className="page-shell shell"><section className="page-hero"><p className="eyebrow">Developer API · public beta</p><h1>Token preflight for apps and agents.</h1><p>The server endpoint returns token, word, and character metrics. Submitted text is processed in-memory for the response and is not intentionally persisted by the application.</p></section><div className="docs-grid"><section className="tool-card"><p className="eyebrow">Endpoint</p><h2>POST /api/v1/tokenize</h2><pre><code>{`curl https://token-intelligence-eight.vercel.app/api/v1/tokenize \\
  -H "Content-Type: application/json" \\
  -d '{"text":"hello world"}'`}</code></pre><p className="muted">Public beta is capped at 500 KB of UTF-8 text per request. API-key subscriptions and organization quotas are the next billing layer.</p></section><section className="tool-card"><p className="eyebrow">Response</p><h2>Count metrics</h2><pre><code>{`{
  "tokens": 2,
  "characters": 11,
  "charactersWithoutSpaces": 10,
  "words": 2,
  "encoding": "o200k_base"
}`}</code></pre><p className="muted">Use it for cost preflight, prompt limits, document chunking, agent budget checks, or your own telemetry.</p></section></div><section className="tool-card docs-section"><p className="eyebrow">Privacy boundary</p><h2>Browser calculator stays local; API calls are explicit.</h2><p>The main calculator does not need to upload prompt text. Calling the developer API is different: your server sends text to the Token Intelligence endpoint for tokenization. The API response is marked <code>no-store</code>, and application code does not write the submitted text to a database.</p></section></main>;
}
