# RE-304: isolated route-gateway pilot certification

This is an evidence record for a **single-instance, explicitly synthetic-only preview** of PR #46. It does not certify the enterprise gateway at `src/lib/gateway`, actual provider behavior, savings, tenant production controls, or launch.

## Runbook (no paid provider calls)

1. Verify the precise commit SHA and independent, completed GitHub Actions outcomes: repository-wide CI, dedicated route-gateway pilot, CodeQL.
2. Use one separately named Railway project/service/environment, with repo branch `feat/routewize-re304-gateway-pilot`, service root `/apps/route-gateway-pilot`, Dockerfile `Dockerfile`, start command `node src/certification-preview.mjs`, one replica, healthcheck `/healthz`. No shared enterprise gateway service, environment, volumes, or secrets.
3. Set `GATEWAY_CERTIFICATION_PREVIEW=FAKE_ONLY`, a random >=32-character per-tenant secret via `GATEWAY_TENANTS_JSON`, and optionally an independent admin key. **Never set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` on this preview.** The entrypoint refuses real provider keys, overrides route configuration with a single `fixture` alias and injects a network-free transport.
4. Test `GET /healthz`: HTTP 200, `provider_mode=synthetic_fixture`. `GET /v1/models` without a bearer credential: HTTP 401; with the provisioned secret: 200, only alias `fixture`.
5. Using a non-sensitive synthetic request, confirm two default `BYPASS` calls, opt-in deterministic `MISS` then `HIT`, independent tenant `MISS`, rejection of tools/streams, and restart causing a new `MISS`. Record only status, provenance headers, synthetic response ID, aggregate metrics, commit and deployment IDs. Never record a credential, request content or third-party text in public evidence.
6. Mark upstream response usage **synthetic fixture**, cache-hit usage **gateway replay** (zero new provider tokens), and cost source unavailable; do not attribute fake usage or replay to invoices. Separate provider-native prompt caching from gateway exact replay. No financial comparison is possible from synthetic transport.

Run the network-level suite with `npm test` in this directory. The `tests/certification.test.mjs` fixture launches an actual HTTP server, tests access and replay, shuts it down, and restarts it in-process with an empty cache and counters.

## Current status / evidence to capture

- Prior pilot proof: https://github.com/rrahul0904/token-calculator/actions/runs/36359490086
- Prior CodeQL proof: https://github.com/rrahul0904/token-calculator/actions/runs/36359490102
- Earlier repository-wide CI was **not green**: https://github.com/rrahul0904/token-calculator/actions/runs/36359684562 (DAST expected 401 but anonymous project creation was denied with 403). The focused DAST assertion now accepts only 401 or 403 and checks the error body for secrets.
- Exact-head final run IDs, deployment URL/ID, live HTTP results, and reviewer approval must be appended only after independently observed. This file is not a self-awarded certificate.

## Holds beyond this slice

Independent security/privacy review; real provider approvals and bounded paid verification with request IDs and invoice/usage reconciliation; comparative quality, latency and net spending against identical direct-provider baseline; operational key rotation, revocation and abuse safeguards; durable, tenant-scoped quota/budget/idempotency and replay policy; outage/restart/multi-replica behavior; integration into the governed enterprise gateway. No upstream Routewize parity or public launch claim.
