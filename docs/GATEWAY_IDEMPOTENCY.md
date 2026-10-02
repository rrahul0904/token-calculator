# Gateway idempotency boundary

The governed gateway accepts an optional `Idempotency-Key` header (1-200 characters). Its durable run ID is a SHA-256 identity scoped to the authenticated organization and API key. A database insert-on-conflict reservation happens before credential decryption or any provider request, so concurrent retries cannot both enter the provider path. Caller-supplied `runId` values are also insert-only and cannot reopen an existing run.

The current gateway does not persist response bodies, so it cannot replay a prior response. Repeating a key with the same normalized request returns `409 GATEWAY_IDEMPOTENCY_RESULT_NOT_REPLAYABLE`; changing the request under the same key returns `409 GATEWAY_IDEMPOTENCY_PAYLOAD_MISMATCH`. Both responses include the original `runId` and `replayed: false`. This is durable at-most-once protection, not full HTTP idempotent response replay. An ambiguous database failure around the reservation must be retried with the same key; no request should be retried under a new key until the run state is reconciled.

The key identity is HMACed with a random, persistent namespace generated for each API key, so raw idempotency keys and credential verifiers are not stored in the digest. The request digest canonicalizes object key ordering, preserves array order, and excludes the idempotency key itself. Only digests are stored; key values and request content are not added to run metadata.

## Remaining production gates

- Monthly token and cost quotas use a durable per-run reservation before provider dispatch. Admission is serialized on the API-key row, and measured usage is recorded by the existing `llm_calls` database trigger. The reservation is released with the measured call transaction; retry, fallback, missing-usage, and interrupted requests retain an `unknown` reservation against quota rather than treating possible charges as zero. Reservations are intentionally conservative and may reject work that could ultimately have cost less.
- Unknown reservations do not expire automatically. They require provider-side reconciliation before an operator releases them; no self-service reconciliation workflow is implemented yet. Organization policy still provides projected-cost and runtime decisions, but its spend reservation is separate from API-key quota admission.
- Retry attempts are recorded as uncertain-charge receipts, and final call receipts mark aggregate cost ambiguous when earlier attempts may have charged. Provider-native charge reconciliation is not implemented.
- Response replay, provider-backed certification, multi-instance concurrency/restart integration tests, kill-switch behavior, provider capability policy, and quality guardrails remain separate graduation gates.

This contract does not certify a provider, pilot, deployment, or production readiness.
