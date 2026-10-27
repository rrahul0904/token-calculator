# Wave 2 — Provider-backed inference admission (2026-10-27)

This adds a **real OpenAI-compatible Chat Completions request** from an authenticated, tenant-scoped API through a configured model server. It is separate from the explicitly simulated endpoint. It is not a GPU runtime, billing system, SaaS launch, or proven Qwen/DeepSeek quality equivalent.

## Configuration

```sh
# Operator-managed on a trusted host/container with PostgreSQL migrations applied
TI_INFERENCE_LIVE_ENABLED=1
TI_INFERENCE_UPSTREAM_BASE_URL=http://127.0.0.1:8000/v1
TI_INFERENCE_UPSTREAM_MODEL=the-exact-model-served-locally
# TI_INFERENCE_UPSTREAM_API_KEY=... # optional, stored in server environment ONLY
```

For remote providers, HTTPS and **both** `TI_INFERENCE_UPSTREAM_ALLOWED_ORIGIN=https://approved-provider.example` and `TI_INFERENCE_PRIVATE_REMOTE_APPROVED=1` are required. Private repository prompts are sent to the approved provider; no remote transfer occurs silently. This is an *application-layer* allowlist only. Production requires external network egress restrictions and DNS/pinning threat review.

Request:

```http
POST /api/v1/inference/chat-completions
Authorization: Bearer <enterprise-api-key-with-gateway:invoke>
Idempotency-Key: request_Unique01
Content-Type: application/json

{"model":"the-exact-model-served-locally","messages":[{"role":"user","content":"Explain my function."}],"max_tokens":256,"store":false,"stream":false}
```

The endpoint denies requests unless PostgreSQL, an Enterprise plan, a valid `gateway:invoke` API key, a **positive requests-per-minute quota**, and a **finite monthly token limit** are all configured. Upstream requests use a server-owned URL and model ID, not caller-selected egress. Tools/functions, stream responses, and prompt/response retention are not supported in this first slice.

## Durable admission state

1. PostgreSQL advisory transaction lock per API key.
2. Same-key idempotency lookup with input SHA-256. Prior admission **always** returns 409: completion content is never stored, so it cannot be replayed. Conflicting reuse returns a different 409.
3. Before forwarding, atomically enforce rolling 60-second requests-per-minute and conservative monthly reservation: estimated input tokens + maximum output token grant.
4. Insert one `inference.admitted` usage event **before** contacting the configured provider. Provider POST runs only after the transaction commits.
5. Insert an `inference.completed` or `inference.failed` event on terminal outcome; provider-reported input/output token counts are preserved only if available. Never persist raw messages, response content, Authorization headers, or provider secrets.

**Billing semantics:** The admission token reservation is conservative and not automatically refunded after failure, because refunds/counter reconciliation need a separate audited process. Results explicitly say `billing_state: not_billed`; no customer charges or token-price calculations occur here. An API key with a monthly USD cost limit is **rejected**, since there is no verified provider price schedule yet. Unknown usage is not represented as measured or billable. If a process crashes after admission, later idempotency requests are intentionally refused to prevent duplicate inference.

**Concurrency:** PostgreSQL protects the admission transaction and same-idempotency model call. This slice does not impose a global active-provider-request concurrency limit; that must be implemented through a dedicated durable lease/capacity scheduler before multi-tenant production.

**Provider safety:** Operator-configured exact HTTPS origin or loopback endpoint; blocked redirects; 16 KiB input and 128 KiB provider-body caps; timeout; response schema checks; 32 KiB maximum returned text; no tool calls; fail closed on partial completions and missing durability.

## Acceptance

Dedicated focused GitHub Actions executes TypeScript checks, migrations, existing simulator tests, live-provider policy tests and disposable PostgreSQL-backed real HTTP provider tests, including tenant entitlements, idempotency, concurrency races and no-prompt receipt checks.

Source lineage: REA project BharatCode public behavior → Token Intelligence canonical gateway; Agent Work OS #86 manages model routing and operator session capabilities. This is an original implementation based on public behavior, not copied source or branding.

### Production gates (NO-GO)

- P0 full-repository npm audit vulnerabilities in Issue #80 (Next.js / MCP SDK / Zod).
- Real GPU/runtime and actual-model UAT; background worker/capacity availability.
- Tenant-global concurrency, failure reconciliation, operational monitoring and verified cost ledger.
- End-to-end Agent Work OS → Token Intelligence authenticated integration with explicit provider/privacy policy.
- Independent security review, adversarial acceptance, rollback, deployment to user-approved AWS/OCI/in-house host and explicit owner approval.

This draft intentionally does not weaken or waive any of those gates.
