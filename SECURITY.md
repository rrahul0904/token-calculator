# Token Intelligence Security

## Scope

Token Intelligence is an AI FinOps, Agent Economics and control-plane application. Security-sensitive surfaces include tenant data, first-party API keys, customer BYOK provider credentials, Stripe/WorkOS/GitHub webhooks, MCP, the governed provider gateway, exports and organization administration.

## Core invariants

- Public calculator prompt text stays in the browser.
- Raw prompts, completions, source code, shell output and raw tool output are not persisted by default.
- First-party API keys are generated from 256-bit random material and stored only as salted scrypt hashes. Full secrets are displayed once.
- Provider BYOK credentials are encrypted with AES-256-GCM and associated data binding tenant + provider + credential ID + key version.
- Provider rotation verifies the replacement before persistence; a failed replacement preserves the existing credential.
- Every tenant-owned query must include organization scope. Project-scoped API keys receive additional project enforcement.
- Unknown/retry cost is never converted to a false zero.
- Gateway policy/quota state fails closed when enforcement authority is unavailable.
- MCP is advisory unless traffic is actually routed through the governed gateway.

## Threat model and controls

### Tenant isolation / IDOR
Organization and project IDs are untrusted request inputs. Server routes derive the authenticated organization from WorkOS membership or the hashed API key record and constrain resource queries accordingly. Cross-tenant project, run, key, budget, provider connection, service-account, usage, outcome and audit access must be covered by integration tests.

### API-key theft
Secrets are never recoverable from the database. Rotation invalidates the old hash immediately. Revocation and service-account revocation take effect transactionally. API-key scopes, project binding, request/minute and monthly token/cost quotas narrow blast radius.

### BYOK theft
The database stores authenticated ciphertext only. Decryption occurs server-side immediately before provider use. Plaintext is never returned after connection creation/rotation.

### Webhook replay and spoofing
Stripe, GitHub and WorkOS inbound webhook signatures must be validated before processing. Stripe/GitHub delivery identifiers are processed idempotently. Outbound Token Intelligence alerts use HMAC SHA-256 over timestamp + payload with a delivery ID.

### SSRF
Outbound alert endpoints require HTTPS, reject embedded credentials and private/loopback/link-local DNS results, re-resolve before each attempt, reject redirects and use tight timeouts. Do not add arbitrary server-side URL fetch surfaces without equivalent controls.

### Gateway runaway spend
Retries are bounded and individually policy-authorized. Fallback is separately evaluated for allowlists, projected spend and approval thresholds. Distributed quota/rate state is PostgreSQL-backed rather than in-memory.

### Sensitive logs
Never log Authorization headers, API keys, provider credentials, prompts, completions, source code or raw tool output. Production error responses should use stable error codes and exclude secret-bearing upstream payloads.

## Secret inventory

Production secrets belong in Vercel encrypted environment variables or encrypted tenant records, never Git:

- `DATABASE_URL`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD`
- `WORKOS_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `TOKEN_INTELLIGENCE_ENCRYPTION_KEY`
- `CRON_SECRET`
- `GITHUB_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `TOKEN_INTELLIGENCE_WEBHOOK_SECRET`

Provider customer keys belong in `provider_connections.encrypted_credential`, not global environment variables.

## Release security gate

A production release requires successful tenant-isolation, privacy, secret-scan, webhook-signature, API-key rotation/revocation, vault-AAD, quota/policy hard-block and provider-gateway tests. A GitHub Actions job that receives no runner and executes zero steps is infrastructure failure, not a successful security gate.

## Reporting

Security findings should be reported privately to the repository owner. Do not open public issues containing credentials, exploit payloads against production tenants or sensitive customer data.
