# Security / launch boundaries

- Internal/private pilot first. All real completion calls consume the operator's configured upstream provider account; there is no per-tenant billing or hard currency budget. Do **not** expose publicly for unrestricted customer signup.
- Gateway keys must be independently random (>=32 chars). Providers' secrets are server-side environment variables only. No request text is logged or persisted; in-memory cache **does contain prompt and response** while the process runs and is enabled only after explicit request opt-in. If input contains PII, secrets, regulated data or third-party data with retention restrictions, keep caching off.
- In a cluster, `GATEWAY_RPM_PER_TENANT` does not enforce a global limit; use existing Postgres-backed limiter from the primary Token Intelligence platform before production.
- API accepts only simple system/user/assistant text messages, `temperature`, `max_tokens`, `stream:false`. Unknown fields are rejected rather than silently dropped. Do not send tools, streaming, JSON-schema outputs or multi-modal data to this pilot.
- This package has no database or account portal. Tenant credentials are provisioned by an operator; no key creation/rotation endpoint. Rotate via platform secrets and redeploy.
- OpenAI and Anthropic are fixed upstream URLs. Redirects are not configured by callers. `cache-control:no-store` on all API responses prevents inadvertent downstream HTTP caching.
- `/healthz` is liveness only; `/admin/metrics` is disabled unless a distinct >=32-character admin key is supplied, and reports only process-local aggregate figures.
- Cost estimates require operator-maintained rates. Anthropic provider native cache economics, retries and invoice reconciliation are not covered here. Never advertise achieved cost savings from these numbers.
