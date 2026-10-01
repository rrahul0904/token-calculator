# RE-341 — Local session economy receipt (Phase 1, bounded)

Issue: https://github.com/rrahul0904/token-calculator/issues/48
Research donor: Occam (MIT), https://github.com/quisbaum-prog/occam
Related owned work: #3 canonical run/event receipts; #43 wire/context attribution; #19 completed local scan/audit.

This is an **independently authored Token Intelligence adapter** over existing normalized local collector events, not a copied hook, policy rule, benchmark runner, pricing engine, or new product. Only the public behavior and issue's research mapping informed its requirements. Do not copy upstream rule text, branding, code, benchmark assets, or claims.

## Included

- `buildLocalSessionMetricReceipt` converts canonical `run.upsert` and `turn.upsert` events to a versioned, metadata-only local session receipt; existing `ti audit --json` exposes `metricReceipt`, and `ti scan --json` exposes deduplicated `sessionMetricReceipts`.
- Deterministic SHA-256-derived opaque local session/run/event references (not raw history paths, IDs, event payloads, prompts, source code, or tool outputs).
- Source provenance: collector, normalized event format, original versus deduplicated event counts, per-run source-event references, run/turn aggregation basis, and normalized usage-source enum.
- Token buckets match #3's fresh input/cache read/cache write/reasoning/output fields. Run snapshots take precedence over turn snapshots, so run and turn totals are never both added. Missing count fields remain unknown rather than fabricated zeros.
- Separate `measuredUsd` and `estimatedUsd`, with basis, optional validated pricing-version label, selected amount and `complete | partial | none` coverage. A run's actual/reconciled figure takes precedence over its alternative estimate. With turn-only evidence, incomplete prices yield a known **portion** but no complete run/session total. Zero is a valid reported cost; missing/invalid/negative amounts are not.
- The existing local-only, metadata-only and overlap-safe audit remains in place. The new view neither automatically uploads nor activates an agent instruction policy. It does not inspect or store raw prompt/code content.

## Limits, next gates and integrations

- `measured` means an amount **reported in the normalized receipt**, not independently audited provider billing. `reconciled_reported` is a source-label, not independent verification. Token usage is likewise collector-reported.
- This view does not reproduce Occam's cost/quality results, claim dollars saved, or assert task equivalence. Unknown prices are left unknown; no generic fallback rate is silently applied.
- Reuse #3's ingestion/identity and outcome-verification contracts for any future opt-in sync; #43's source/context cost buckets for future richer receipts; and #19's existing local discovery/dedupe. No new API, DB, proxy, collector, policy hook, provider calls, or browser surface is added here.
- A separately reviewed **opt-in** policy phase would need isolated activation, explicit off switch, no `bypassPermissions`, and must not cut requested validation/security/accessibility work. It is not implemented here.
- Any savings experiment must use independent seeded randomized paired fixtures with comparable verified outcomes and separate provider reconciliation. Fixture tests here only exercise deterministic contract behavior.
- No production integration, independent benchmark reproduction, hosting, billing, tenant isolation, deployment, or commercial-readiness claim is made.

Verification target: `npx vitest run tests/local-session-metrics.test.ts tests/local-usage-audit.test.ts tests/local-usage-scan.test.ts`, `npm run typecheck`, existing CI at the exact branch SHA. Locally inspect `ti audit ... --json` and `ti scan ... --json`; those commands must not request a network connection or API key.
