# Route Gateway Pilot (RE-304)

A **clean-room, deployable single-instance pilot** under Token Intelligence. It is not the Routewize proprietary application or a claim of upstream parity. The production Token Intelligence gateway in `src/lib/gateway` remains canonical for enterprise BYOK, governed runs, budget enforcement and provider receipts. This isolated pilot demonstrates an easy integration path for an explicitly configured OpenAI-compatible gateway and **opt-in exact response replay** without changing its production state machine.

## Currently implemented

- `POST /v1/chat/completions`: limited, text-only, non-streaming OpenAI-compatible shape; configured alias selects an OpenAI or Anthropic endpoint. No automated quality-based routing or arbitrary upstream URL.
- `GET /v1/models`: authenticated route alias list. `GET /healthz`: liveness. `GET /`: public documentation/test payload builder. Optional authenticated `GET /admin/metrics` returns **process-only** counters; never prompts.
- Per-tenant bearer credentials; fixed-window per-tenant rate limit; 32 KiB body cap; 30-second provider timeout; upstream error sanitization.
- Response cache is **off by default**. An explicit `x-ti-cache: exact` plus `temperature: 0` opts in. Cache key contains tenant, provider, actual model, full canonical request and a key version; max 300-second TTL, bounded entries, *memory only*. Only complete text responses with observed provider usage are eligible. Cached replay reports zero **new provider usage** in its `usage` object and `x-ti-usage-source: gateway_replay` instead of misreporting original usage as newly incurred.
- Configured pricing rates yield **estimates**, not provider invoices or independently proven savings. Provider prompt-cache read/write rates are not modeled separately in this pilot: do not use its cost values as accounting truth.

## Local start

Requires Node 22+. No npm dependencies. Supply real secrets in environment (see `.env.example`) and run:

```bash
npm test && npm run check
set -a; . ./.env; set +a
npm start
```

Set `GATEWAY_KEY` in your shell to the tenant secret using a secure local method. Example:

```bash
curl -sS http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -H 'x-ti-cache: exact' \
  -d '{"model":"economy","messages":[{"role":"user","content":"Reply with one sentence about caching."}],"temperature":0,"max_tokens":80}'
```

## Deployment

Set Railway service root directory to `/apps/route-gateway-pilot` in `rrahul0904/token-calculator`, Dockerfile `Dockerfile`, healthcheck `/healthz`; set `GATEWAY_TENANTS_JSON`, `GATEWAY_ROUTES_JSON`, relevant provider credentials, and optionally `GATEWAY_ADMIN_KEY`. Use **one replica only**. Review actual provider pricing and service budget. Deploy the feature branch for isolated certification, then advance by approved merge/deployment. Health-check success is not proof of real provider calls. Never put provider or gateway secrets in public client JavaScript.

### Known constraints / release gates

This pilot is not multi-replica-safe: cache, quota and metrics are per process and reset on restart. It has no Postgres receipts, idempotent retry, streaming/tools/multimodal, tenant self-service signup, provider-native prompt-cache accounting, validated quality-based dynamic routing, production-grade budget enforcement, billing integration or verified savings. It must not be marketed as production-ready for other organizations. See `SECURITY.md` and the original RE-304 dossier. Promote capabilities to the existing governed gateway with tenant-scoped durable storage and identical policy enforcement before general availability.

## Synthetic-only certification preview

For a controlled single-replica preview with **zero paid-provider requests**, use the separate entrypoint `node src/certification-preview.mjs` (not the normal `npm start`). Set `GATEWAY_CERTIFICATION_PREVIEW=FAKE_ONLY` and `GATEWAY_TENANTS_JSON` with separately generated tenant secrets. Do not set real OpenAI/Anthropic keys on that environment; this entrypoint refuses them. It enforces only the `fixture` model alias, injects a network-free deterministic transport, visibly labels the public documentation and `/healthz` synthetic, and does not emit provider-cost estimates. The usual `src/server.mjs` behavior remains separate and unchanged.

Run `npm test && npm run check` to execute network-level synthetic certification tests, including anonymous 401, authenticated model enumeration, default BYPASS, explicit MISS/HIT, cross-tenant isolation, unsupported request rejection, and empty replay cache after server restart. See [CERTIFICATION.md](./CERTIFICATION.md) for deployment settings, evidence requirements, and the remaining release holds. A synthetic preview is not a real-provider or production certification.
