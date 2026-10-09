# Token-saving portfolio — Wave 3: repository intelligence donors

Tracking issue: #60  
Implementation PR: #61

## Product decision

Serena, Repowise, CocoIndex Code, Semble and jCodeMunch are not five standalone Token Intelligence products. They are capability donors for one owned repository-context/evidence layer.

Token Intelligence already has `src/lib/optimization/repository-context.ts`, which evaluates repository retrieval at the full-session boundary: index freshness, required-evidence coverage, fallback reads, quality, latency and measured token economics. This wave expands source provenance and behavior mapping without copying donor runtimes or creating parallel indexes by default.

## Verified source snapshots and license boundaries

| Donor | Reviewed source | Snapshot | License boundary | Token Intelligence use |
| --- | --- | --- | --- | --- |
| Serena | `oraios/serena` | `3b99f8b024dafd58c962ea6e74f37c8a730ef532` | Serena application GPL-3.0-or-later; SolidLSP MIT | behavior/benchmark donor; clean-room symbol/LSP retrieval contracts only |
| Repowise | `repowise-dev/repowise` | `7f84ae07908de40595fc64b3fe3c910123367a1e` | AGPL-3.0 | behavior/benchmark donor unless separate licensing review authorizes reuse |
| CocoIndex Code | `cocoindex-io/cocoindex-code` | `b883be0b5d762c9e2d7d82afdedeade5df21d5be` | Apache-2.0 | clean-room architecture comparison; compatible ideas may be independently implemented |
| Semble | `MinishLab/semble` | `44785838c41a026c3c022a0b894b69b32a1e0ac6` | MIT | clean-room semantic/hybrid retrieval comparison |
| jCodeMunch MCP | `jgravelle/jcodemunch-mcp` | `95b0cd09652ac14b2806c12c01af7262ae125313` | dual-use; commercial/for-profit use requires paid license | behavior/benchmark donor only unless explicit commercial license is approved |

Exact source provenance is stored in `src/lib/optimization/source-evidence.ts`. The restrictive license text is treated as a product boundary rather than something to work around.

## Capability decomposition

### Symbol-aware navigation

Serena and jCodeMunch emphasize symbol/function/class-level retrieval instead of full-file dumping. Useful owned primitives:

- stable symbol identity;
- definition/reference relationships;
- bounded source spans;
- language-server/tree-sitter provenance;
- fallback-to-file-read receipt when symbol resolution is incomplete;
- freshness/version identity for indexed symbols.

### Repository knowledge graphs

Repowise and adjacent graph/index donors expose dependency/history/architecture relationships so the agent does not rediscover the repository every session. Useful owned primitives:

- node/edge provenance;
- graph/index snapshot identity;
- stale-graph invalidation;
- coverage of task-required relationships;
- indexing/setup economics;
- retrieval latency;
- fallback and miss accounting.

### Semantic/hybrid retrieval

CocoIndex Code and Semble demonstrate semantic and hybrid retrieval over code. Useful owned primitives:

- query/retrieval strategy identity;
- embedding/index version;
- lexical vs semantic vs reranked route provenance;
- top-k/context token budget;
- required-evidence coverage;
- duplicate/redundant context rate;
- index build/update cost;
- full-session outcome quality.

## Existing Token Intelligence contract

`src/lib/optimization/repository-context.ts` already refuses to promote local retrieval compression into verified savings when:

- the index is stale;
- required repository evidence is missing;
- fallback file reads erase the apparent savings;
- task quality regresses;
- evidence is modeled rather than measured;
- the sample cohort is too small.

This wave therefore does **not** add five donor-specific evaluators. The next implementation should enrich the owned repository-context receipt with strategy/index provenance only where that improves controlled experiments and observability.

## Clean-room implementation boundary

Do not copy donor source layout, prompts, MCP tool names, UI, graph schemas, installers, CLI behavior or branding. In particular:

- GPL/AGPL donor source is not incorporated into Token Intelligence's proprietary application code by this reverse-engineering program;
- jCodeMunch source is not used commercially without explicit paid-license review;
- permissively licensed donor code is still not imported merely because reuse is legally possible—the default remains independently designed Token Intelligence contracts;
- benchmark/retrieval claims remain donor claims until reproduced against Token Intelligence's same-cohort, full-session quality gates.

## Acceptance criteria for owned repository intelligence

1. Retrieval/index version is explicit and auditable.
2. Stale indexes fail closed for savings verification.
3. Every task-required evidence reference is either retrieved or reported missing.
4. Fallback full-file reads are charged to candidate tokens.
5. Index build/update cost and latency are observable.
6. Retrieval strategy and route provenance are recorded.
7. No raw repository content is required by the portfolio-level evaluator.
8. Baseline and candidate use the same versioned task cohort.
9. Outcome quality is non-inferior before savings are claimable.
10. No donor-specific savings percentage is copied into the product.

## Next engineering slice

Add repository-strategy provenance to the owned receipt/evaluator and link controlled repository-context candidates to authoritative run/experiment receipts. Do not build a second persistent repository index until experiments show an existing Token Intelligence primitive cannot support the required behavior.
