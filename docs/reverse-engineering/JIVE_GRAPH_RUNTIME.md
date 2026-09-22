# Jive graph-runtime donor: clean-room reverse engineering

Tracker: **RE-209**  
Source share link: https://www.reddit.com/r/coolgithubprojects/s/4SLqUXrJaX  
Canonical post: https://www.reddit.com/r/coolgithubprojects/comments/1wmp07o/jive_rethinking_the_agentic_loop_with_system_one/  
Upstream: https://github.com/merijjeyn/jive  
License observed upstream: MIT  
Reviewed: 2026-09-22

## Product thesis

Jive treats the planner's next action as an executable graph instead of forcing a full reasoning-model round trip after every tool result. The planner can express a DAG containing ordinary tool work and lower-cost structured decisions, with explicit dependencies, loops, expansion, recovery and planner handoff.

For Token Intelligence, the useful donor surface is not Jive's terminal UI or branding. The useful surface is **graph-aware economics and evidence**: capture enough identity, routing, cost, latency, failure and outcome information to prove whether a fast/slow execution plan actually reduces spend or latency without reducing task quality.

## Upstream capabilities observed

The public Jive design and repository describe:

- a main planning model that emits graph calls;
- declarative DAG execution with explicit references;
- parallel branches, bounded loops, per-item expansion and recovery paths;
- separate fast structured decisions and full reasoning steps;
- explicit failure/blocking semantics;
- persisted graph definitions, artifacts and execution events;
- stable execution identities for graph, node, expansion item and loop iteration;
- bounded concurrency, elapsed time and decision-call ceilings;
- context projections that keep full evidence outside the planner prompt;
- replay/modification of saved graphs.

Treat upstream benchmark numbers as upstream-reported claims. Token Intelligence must generate its own controlled evidence before presenting savings or quality claims.

## Clean-room boundary

Do not copy Jive's source layout, terminal design, graph JSON shape, naming, or implementation code. This repository implements Token Intelligence-native contracts around its existing Agent Run Receipt, policy, gateway, evaluation and verified-savings architecture.

## First implemented slice

This branch adds a provider-neutral graph telemetry contract at:

`src/lib/graph-telemetry/schema.ts`

The contract records:

- graph/run/version identity;
- stable node execution identity;
- parent/group/iteration identity;
- dependency status;
- routing class: `reasoning | decision | deterministic_tool`;
- provider/model attribution;
- provider-native token buckets;
- measured vs estimated usage source;
- cost, node latency and retries;
- planner handoff reason;
- terminal status and blocked/policy states;
- artifact/evidence references;
- policy decisions;
- outcome linkage.

It also adds deterministic summary logic and a savings comparator that refuses to mark savings as verified unless outcome equivalence is explicit.

## Why this precedes an executor

Token Intelligence already owns canonical run, turn, LLM-call, tool-call, budget-decision and outcome records. Adding graph telemetry before an executor lets us instrument Jive-like or other DAG runtimes without prematurely coupling the product to one execution engine.

The next implementation slice should persist this contract through the canonical ingest/storage layer, then add one controlled sequential-vs-DAG evaluation fixture using the existing deterministic evaluation/regression gates.

## End-to-end roadmap

1. Persist graph run/node receipts and indexes.
2. Add idempotent graph-event ingestion.
3. Link LLM/tool calls to graph node execution IDs.
4. Enforce graph-level budgets: planner turns, decision calls, retries, parallelism and fallback approvals.
5. Add graph waterfall and route-class views to run observability.
6. Add failure taxonomy for validation, transport, tool failure, policy block, acceptance failure, cancellation, exhausted loop and blocked dependency.
7. Add replay/compare with side-effect safety labels.
8. Add controlled benchmark fixtures and require equal-or-better outcomes before verified savings can be surfaced.
9. Only after telemetry and policy are stable, evaluate whether Token Intelligence should provide its own thin graph executor or remain execution-engine neutral.
