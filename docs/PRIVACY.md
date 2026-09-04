# Privacy Architecture

Token Intelligence deliberately has different privacy boundaries for different integration modes. Do not market all modes as “nothing leaves your machine.”

## Public browser calculator

Prompt/context text is tokenized in-browser. It is not intentionally submitted to a Token Intelligence prompt-analysis endpoint and is not persisted by the application.

## Local coding-agent collectors

Codex, Claude Code, Cursor and Antigravity/Gemini CLI records are parsed locally. Raw transcript text, source code and raw tool output stay on the developer machine. When sync is enabled, collectors emit normalized economic metadata only: run/turn IDs, model, token buckets, timestamps, tool categories, retries/fallbacks, status and explicitly supplied project/repository identifiers.

The server metadata privacy guard rejects known raw-content and credential fields recursively.

## REST and MCP

REST/MCP receive what the caller deliberately sends. Economics endpoints usually need token counts rather than prompt text. `record_usage` accepts metadata-only receipt events and is subject to the server privacy guard.

MCP does not automatically see unrelated model traffic. It can estimate, query stored telemetry and record explicitly supplied telemetry. Hard control occurs only for traffic that crosses an enforceable provider/gateway boundary.

## Governed gateway

The gateway necessarily receives model request content in transit because it forwards that request to the selected provider. By default the gateway does not persist the prompt, completion, source code or raw tool output. It persists economic receipts including model/provider, measured usage, latency, policy decisions, retry/fallback lineage, status and cost certainty.

## Credentials

Token Intelligence API keys are one-way scrypt hashes. Provider BYOK credentials are AES-256-GCM ciphertext bound to tenant/provider/credential/version. Alert destination URLs are encrypted when they may contain sensitive tokens.

## Content retention

`contentRetentionEnabled` is false by default. Enabling content retention in the future must be an explicit organization choice with separate encryption, retention and deletion controls. It must never be implicitly enabled by selecting a paid plan.

## Data retention

Organizations can configure separate retention windows for telemetry, runs, findings and audit records. Cleanup is tenant-scoped. Some account/billing/security records may have independent retention requirements and are not deleted merely because agent telemetry expires.

## OpenTelemetry and SIEM

Default OTLP and audit/alert exports are metadata-only. They must not contain prompts, completions, source code, API keys, provider secrets or raw tool outputs.

## Wave 1C.2 calculator sharing and tokenize API

Shareable calculator links contain numeric workload assumptions only. When the user is in pasted-text mode, the application converts the current result to a numeric token workload before creating the URL. Raw prompt text is never placed in the query string or fragment.

The public `POST /api/v1/tokenize` route is a separate explicit server-side boundary. It processes text supplied by the caller to produce the response, sets `Cache-Control: no-store`, and does not intentionally persist or log the request text. Optional model selection changes tokenizer-family/precision metadata; it does not change the retention boundary.

The browser privacy regression continues to fail if a pasted sentinel appears in any outgoing request body. A separate share-link regression verifies that copied URLs do not contain pasted prompt text.
