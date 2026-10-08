# Headroom donor dossier

Tracking branch: `codex/headroom-context-optimizer-20261008`  
Portfolio base: `codex/token-saving-portfolio-20261006`  
Donor: `headroomlabs-ai/headroom`  
Reviewed source snapshot: `17abee2721c1946bc8903d623bec91ff6e531c17`  
Reviewed: 2026-10-08  
License: Apache-2.0

## Decision

Headroom is a strong **request/context-compression behavior donor** for Token Intelligence. We should absorb the architectural ideas that are independently useful to our product while keeping Token Intelligence's stricter evidence model:

- compress the live/newest context delta rather than blindly rewriting the full history;
- protect the stable provider-cache prefix;
- detect payload type before choosing a transform;
- make code compression explicit/opt-in;
- keep transformed content locally recoverable;
- expose per-transform receipts and latency;
- separate payload shrinkage from verified end-to-end session savings;
- refuse Headroom's upstream benchmark percentages as Token Intelligence proof until our own paired workload receipts reproduce them.

Do **not** copy Headroom source code, UI, branding, compressor implementation, plugin assets, prompts, or benchmark figures into Token Intelligence claims.

## 1. Source identification

### Canonical source

- Project: `headroomlabs-ai/headroom`
- Repository: `https://github.com/headroomlabs-ai/headroom`
- Default branch reviewed: `main`
- Snapshot reviewed: `17abee2721c1946bc8903d623bec91ff6e531c17`
- License: Apache-2.0

The repository itself describes Headroom as a local compression layer for AI-agent inputs/tool outputs and exposes library, proxy and MCP integration surfaces.

The earlier Token Intelligence portfolio had already enrolled both `headroom` and `headroom-desktop`, but the deep donor dossier and a bounded owned implementation were still missing. This branch closes that gap for the core Headroom behavior family.

## 2. Evidence collection

Observed from current first-party documentation/source rather than accepted from launch marketing:

1. Requests can flow through a local proxy or library API before reaching the upstream LLM.
2. A content router classifies material and selects a content-appropriate compressor.
3. Current context management emphasizes **live-zone-only** compression: newest user/tool material can be transformed while the older stable prefix remains untouched.
4. The stable prefix is protected to preserve provider prefix caching across turns.
5. Content classes include JSON, logs, search/tool results, plain text and source code; source-code compression is opt-in in the documented quickstart/install path.
6. Headroom exposes recovery/retrieval concepts so a compressed representation does not have to be the only copy of the underlying data.
7. The project exposes proxy statistics such as before/after token counts and transform names.
8. Current source also includes compressed inter-agent context sharing, reinforcing the usefulness of a recoverable compressed handoff abstraction.
9. The current project ships several optional integrations/extras rather than requiring one monolithic runtime.
10. Headroom publishes strong token-reduction figures, but these remain **upstream claims** for our purposes.

## 3. Product and workflow reconstruction

Observed user flow:

1. User places the local library/proxy/MCP layer between an agent/client and the provider.
2. A request arrives with a stable history plus newest live content/tool output.
3. The live content is classified by type.
4. An appropriate transform is selected.
5. The stable prefix remains byte-stable in the cache-preserving path.
6. The transformed live payload is forwarded to the model.
7. Local statistics record before/after behavior.
8. If full source material is needed again, a recovery/retrieval path can provide it.
9. Optional code compression requires explicit enablement.

For Token Intelligence, the economically relevant unit remains the **whole successful session**. A 70% smaller JSON payload is not automatically a 70% session-token or dollar saving once cache behavior, retries, recovery, auxiliary compression work and task outcome are counted.

## 4. Capability decomposition

Useful behavior primitives:

- stable-prefix protection;
- live-zone classification;
- content-type router;
- deterministic/lightweight transformations where possible;
- opt-in code transforms;
- local recovery store;
- transform receipt;
- estimated pre-filter savings threshold;
- measured provider-token verification downstream;
- quality/evidence preservation gate;
- recovery/retry accounting;
- compression latency accounting;
- cache-prefix regression gate.

### Failure modes to model explicitly

1. **Cache destruction** — recompressing old turns changes the prefix and sacrifices provider cache hits.
2. **Evidence loss** — a compressor drops the exact line/schema/result required to solve the task.
3. **Recovery failure** — the compressed payload references information that can no longer be retrieved.
4. **Code corruption** — transformations alter whitespace/syntax/ordering that matters to code or generated patches.
5. **False savings** — approximate payload shrinkage is presented as measured provider usage.
6. **Retry amplification** — lossy compression triggers another tool call or model turn that costs more than was saved.
7. **Latency regression** — compression overhead worsens interactive performance.
8. **Privacy regression** — originals are uploaded or durably persisted when a local in-memory path would suffice.
9. **Cross-session leakage** — a recovery identifier resolves content from another tenant/project/session.
10. **Transform overreach** — a type detector applies a risky transform to unknown content.

## 5. User-feedback / claim posture

The source project's popularity and published examples indicate meaningful interest, but popularity is not evidence of correctness for our product. Token Intelligence therefore treats:

- upstream percentages as donor claims, not verified-savings receipts;
- screenshots/demos as product evidence, not workload benchmarks;
- a compressed payload as a candidate, not a production recommendation;
- recovery and outcome equivalence as mandatory gates for lossy transforms.

The Headroom design also directly addresses a common criticism of context compressors: continuously rewriting historical context can destroy the very prompt-cache economics the optimizer is trying to improve. Our clean-room slice makes stable-prefix protection a mechanical invariant instead of a UI option.

## 6. Competitive / adjacent mapping

### Headroom

Strengths: type-aware compression, local proxy/library/MCP surfaces, stable-prefix-aware live-zone behavior, recovery concepts, observability.

Risk for our use: benchmark claims belong to its workloads and implementation; we need independent measurement.

### llmtrim

Adjacent request-context proxy pattern. Useful for comparing full-request transformation, fallback and cache-boundary behavior. Token Intelligence should keep one owned context-compression contract rather than cloning each proxy.

### Context Mode

More virtualization/retrieval oriented: keep bulky tool data outside the active context and selectively retrieve. Complements rather than replaces compression.

### RTK

Primarily command/tool-output filtering. Often lower-risk than semantic compression when domain-specific output can be mechanically reduced.

### Token Intelligence conclusion

The owned product should choose among reduction, virtualization, retrieval, caching and compression based on evidence; it should not become a Headroom clone.

## 7. Existing internal primitive audit

Already present on the portfolio base:

- `src/lib/optimization/context-compression.ts`
  - payload-only vs full-session scope;
  - quality gate;
  - cache-prefix gate;
  - required-evidence preservation;
  - auxiliary compressor token accounting;
  - recovery/retry token accounting;
  - latency;
  - minimum sample gate;
  - measured-before/after requirement for `verified_savings`.
- broader paired-run and canonical economics receipts;
- portfolio lifecycle gate;
- source-evidence registry;
- MCP portfolio analysis surface.

Missing before this branch:

- an owned, executable cache-preserving live-context transform plane;
- a caller-owned recovery store;
- conservative content detection;
- default refusal to transform code;
- a strict `estimateOnly` local pre-filter boundary.

## 8. Product thesis and target boundary

### Thesis

Token Intelligence should answer two different questions separately:

1. **Can we safely send a smaller live payload while keeping the stable prefix intact and the original recoverable?**
2. **Did doing that reduce total successful-session tokens/cost without hurting task quality?**

The first can be implemented locally and deterministically. The second requires paired measured evidence.

### In scope for this slice

- live/stable zone contract;
- type detection;
- JSON minification;
- repeated-log and repeated-search-line reduction;
- conservative whitespace reduction for text;
- opt-in code whitespace reduction only;
- process-local recovery;
- cache-prefix protection;
- estimated token pre-filter clearly marked as non-measured;
- unit tests.

### Out of scope for this slice

- Headroom's ML compressor/model;
- donor algorithm/source copying;
- transparent CA/system proxying;
- durable original-payload persistence;
- remote recovery service;
- automatic production interception;
- a universal savings percentage;
- production rollout.

## 9. Behavior contracts

The clean-room contract implemented in `src/lib/optimization/live-context-transform.ts` requires:

1. A `stable_prefix` block is returned byte-for-byte unchanged.
2. Stable-prefix blocks never enter the recovery store.
3. A `live_zone` block may be transformed only by its detected/declared content class.
4. Code remains unchanged unless `allowCode` is explicitly true.
5. Every accepted transform stores the exact original in a caller-owned process-local recovery store.
6. A transform that does not clear a local estimated-savings floor is refused.
7. The local estimate is always labeled `estimateOnly: true` and is never provider usage proof.
8. Unknown/no-op content fails conservatively rather than forcing a transform.
9. `cachePrefixPreserved` remains explicit in each receipt.
10. Verified savings still flow through `evaluateContextCompression`, not through this transform receipt.

## 10. Clean-room implementation

Added:

- `src/lib/optimization/live-context-transform.ts`
- `tests/live-context-transform.test.ts`
- this dossier

Implemented transforms:

- JSON: parse + compact serialization;
- log: ANSI removal, trailing-space cleanup, adjacent duplicate-line collapse;
- search/tool text: adjacent duplicate-line collapse + whitespace cleanup;
- text: trailing-space and excess-blank-line cleanup;
- code: whitespace-only cleanup, **off by default**.

The exact original is retained only in the caller-supplied in-memory recovery store for transformed blocks. The transform result sent onward does not contain the original.

## 11. Independent verification requirements

Required before promotion into the portfolio base:

- TypeScript typecheck;
- focused `live-context-transform` tests;
- existing context-compression tests;
- complete token-saving portfolio contract workflow;
- CodeQL/security checks triggered for the exact head;
- review that no donor implementation/branding was copied;
- review that no approximate token estimate is surfaced as measured usage.

Required before production interception:

- paired real-provider workload benchmark;
- cache-hit comparison baseline vs candidate;
- task-outcome equivalence;
- failure/retry accounting;
- recovery-path reliability test;
- latency distribution;
- privacy review;
- multi-tenant/project recovery isolation if recovery becomes durable.

## 12. Hosted/browser/recovery certification

Not claimed by this branch.

This branch adds a library/domain slice only. It does not intercept Production traffic, change provider base URLs, install certificates, write user agent configuration, deploy a desktop process, or persist raw content.

A future hosted/UI surface should show:

- measured provider tokens separately from estimates;
- payload reduction separately from full-session verified savings;
- cache-prefix preservation status;
- transform type;
- recovery availability;
- latency and retry/recovery overhead;
- evidence confidence.

## 13. Roadmap integration / next slices

### Phase A — complete in this branch

- canonical donor deep dive;
- clean-room live-context transform contract;
- local reversible recovery path;
- stable-prefix invariant;
- tests.

### Phase B — benchmark harness

- build a fixture corpus for JSON, logs, search output, text and code;
- use the repository's real tokenizer/provider accounting instead of the cheap local estimate;
- compare payload tokens, full-session tokens, quality and latency;
- include incompressible and adversarial fixtures.

### Phase C — provider/cache evidence

- measure cache-read/write behavior on the same multi-turn workload;
- verify the stable prefix actually remains cacheable for each provider integration;
- compare cache-preserving vs token-max strategies rather than assuming one always wins.

### Phase D — retrieval/recovery contract

- expose a bounded retrieval tool for transformed originals without leaking raw content into metadata;
- scope refs by tenant/project/session;
- add expiry and explicit deletion;
- add restart semantics only after persistence/privacy design is approved.

### Phase E — integration surface

- integrate as an optional recommendation/experiment in the existing Token Intelligence optimization portfolio;
- do not auto-activate;
- require evidence before recommendation promotion;
- surface exact receipts in the existing findings/verified-savings UX rather than creating a parallel savings ledger.

### Phase F — release gate

Production eligibility requires exact-head CI/security, paired measured provider evidence, cache preservation, quality equivalence, recovery reliability, privacy review and rollback proof.

Until those gates pass, this remains an **experimental clean-room capability**, not a production Headroom replacement and not a verified universal token-savings claim.
