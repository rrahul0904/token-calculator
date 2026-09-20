# Astra Flash Orchestrator — Reverse Engineering and Token Intelligence Integration

## Source

- Reddit discussion: https://www.reddit.com/r/vibecoding/comments/1wl3lfi/i_built_an_orchestration_package_that_lowered_my/
- Reference implementation: https://github.com/ethanplusai/astra-flash-orchestrator
- Snapshot reviewed: 2026-09-19

## Why this belongs in Token Intelligence

This is not a new product. The useful idea is a routing/economics pattern that fits the existing Token Intelligence control plane:

1. a premium planner/reviewer owns scope, architecture, sensitive decisions, and acceptance;
2. a lower-cost executor owns high-volume repository discovery, implementation, testing, debugging, and routine verification;
3. execution evidence returns to the premium reviewer in a batched acceptance pass;
4. telemetry records both roles so savings can be measured and verified rather than merely estimated.

The existing repository already contains the required neighboring primitives: gateway execution, provider routing, runtime budgets, policy evaluation, telemetry, experiments, Route Lab, and verified-savings evidence. This integration must extend those surfaces instead of creating a duplicate orchestrator, calculator, gateway, or usage ledger.

## What the reference system actually does

Reference flow:

```text
premium root -> scope + design + task brief
cheap worker -> discover + implement + test + report
premium root -> review + verify + accept / request fixes
             -> integrate + checkpoint + next bundle
```

Important mechanics worth preserving:

- Thin-root orchestration: keep the premium model out of the repetitive implementation loop.
- Coherent bundles: delegate an end-to-end feature slice, not every tiny coding action.
- One writer by default to reduce conflicting edits.
- Explicit worker contract and acceptance criteria.
- Evidence-first completion: changed paths, commands, exit status, salient results, outstanding risks.
- No worker self-acceptance.
- At most one normal correction cycle before escalation.
- Premium review for architecture, security, authorization, payments, tenancy, secrets, destructive migrations, production, and shared infrastructure.
- Fail closed when the requested worker/provider route is not available.
- No silent fallback to a different model/provider.
- Installation/setup should not be treated as proof that routed inference actually worked.

## What we should NOT copy literally

- Do not hard-code GPT-6 Astra or DeepSeek V4.1 Flash as the product architecture.
- Do not depend on a personal `~/.codex` installation model.
- Do not rely on prompt-only policy as the enforcement boundary.
- Do not equate lines of code with quality or business outcome.
- Do not market a 98% reduction as a universal result.
- Do not introduce a second telemetry, policy, gateway, experiment, or savings subsystem.

## Source benchmark: useful but limited

The reference repository reports one local field benchmark captured on 2026-09-19. It compares an all-premium-model phase, an earlier orchestration phase, and a thin-orchestration phase.

The source reports 98.9% lower premium-model input per 1,000 implementation/test lines and 97.0–97.7% lower API-equivalent compute per 1,000 lines for its thin phase.

Treat these figures as a hypothesis-generating case study only. The source itself notes that the phases used different task mixes, some thin-phase work had not yet reached final acceptance, Astra pricing was estimated rather than a public API SKU, and lines of code are an imperfect denominator.

Token Intelligence should reproduce the *method*, not the headline: compare like-for-like workloads, capture exact routed model/provider usage, evaluate quality gates, and only then issue verified-savings evidence.

## Token Intelligence adaptation

### 1. Orchestration profile

Add a first-class orchestration profile describing roles rather than branded models.

Suggested contract:

```ts
type OrchestrationProfile = {
  id: string;
  name: string;
  plannerRoute: RouteSelector;
  executorRoute: RouteSelector;
  reviewerRoute: RouteSelector;
  maxCorrectionCycles: number;
  maxParallelWriters: number;
  requireExactRoute: boolean;
  riskEscalation: RiskClass[];
  evidencePolicyId?: string;
  budgetPolicyId?: string;
};
```

Default behavior:

- planner and reviewer may resolve to the same premium route;
- executor can be a cheaper route selected by policy;
- `requireExactRoute=true` fails closed rather than silently substituting another model;
- one writer by default;
- high-risk categories bypass cheap execution or require a premium review gate.

### 2. Task bundle contract

Represent each delegated unit as a coherent task bundle:

```ts
type OrchestrationTaskBundle = {
  taskId: string;
  objective: string;
  allowedPaths?: string[];
  acceptanceCriteria: string[];
  verificationCommands?: string[];
  dependencyTaskIds?: string[];
  riskClass: RiskClass;
  expectedWorkload?: WorkloadEstimate;
};
```

The executor receives the bundle plus repository constraints and returns a structured evidence packet.

### 3. Evidence packet

```ts
type ExecutorEvidence = {
  taskId: string;
  route: {
    provider: string;
    model: string;
    resolvedBy: "explicit" | "policy";
  };
  changedPaths: string[];
  verification: Array<{
    command: string;
    exitCode: number | null;
    resultSummary: string;
  }>;
  risks: string[];
  status: "ready_for_review" | "blocked" | "failed";
  usageReceiptIds: string[];
};
```

The reviewer must not trust a worker's claimed model identity. Route identity should come from gateway/provider telemetry.

### 4. Economics and telemetry

Each orchestration run should record:

- root/planner tokens and cost;
- executor tokens and cost;
- reviewer tokens and cost;
- cache-hit/cached-input economics where available;
- wall-clock latency;
- correction cycles;
- failed routes and retries;
- acceptance/rejection result;
- quality/evaluation score;
- policy decisions and route provenance;
- baseline route for comparison;
- expected vs actual spend;
- verified savings only after the experiment/evaluation gate passes.

The denominator should be configurable. Lines of code may be available for engineering experiments, but preferred product-level denominators include accepted task, accepted evaluation case, successful run, and outcome score.

### 5. Route Lab

Extend Route Lab with an orchestration scenario:

- Baseline: single premium model
- Candidate: premium planner/reviewer + lower-cost executor
- Optional variants: different executor models/providers
- Inputs: workload shape, expected context, output volume, cache assumptions, failure/correction assumptions
- Outputs: estimated cost, actual cost when replay data exists, latency, quality score, route provenance, savings confidence

### 6. Experiments and verified savings

Use the existing experiment and verified-savings systems.

A savings claim should require:

1. baseline and candidate workloads drawn from the same evaluation dataset or replay cohort;
2. exact provider/model usage receipts;
3. acceptance/evaluation threshold met by both baseline and candidate;
4. no unresolved high-severity regression;
5. pricing provenance captured for the experiment window;
6. confidence/support metadata stored with the result.

Only then should Token Intelligence classify the result as verified savings.

### 7. Policy engine

Add orchestration-aware policy inputs:

- task risk class;
- expected premium-model spend;
- executor candidate route;
- data-sharing/provider restrictions;
- tenant policy;
- maximum correction cycles;
- minimum evaluation score;
- route availability;
- production/change-management sensitivity.

Example outcomes:

- `delegate_executor`
- `premium_only`
- `delegate_with_premium_review`
- `block_unapproved_provider`
- `block_budget_exceeded`
- `block_route_unavailable`

### 8. Gateway

The gateway remains the single enforcement point.

Required behavior:

- resolve planner/executor/reviewer routes;
- preserve exact route provenance;
- enforce provider/tenant/data policies;
- meter every call;
- fail closed for required route mismatches;
- avoid silent provider substitutions;
- surface route-unavailable evidence to the orchestration run.

### 9. UI

Add an "Orchestration" section to Route Lab instead of a separate product page.

Proposed panels:

- Role routing: planner / executor / reviewer
- Estimated economics
- Replay / experiment
- Quality gate
- Verified savings
- Route evidence
- Risk escalation events

## Implementation slices

### Slice A — Domain model and schemas

- orchestration profile schema
- task bundle schema
- executor evidence schema
- orchestration run/phase receipts
- exact route provenance
- migration + contract tests

### Slice B — Policy and route selection

- planner/executor/reviewer selection
- exact-route fail-closed behavior
- high-risk escalation
- budget guard
- provider/data-sharing policy
- policy tests

### Slice C — Gateway telemetry

- role-aware call metadata
- parent orchestration run ID
- task bundle ID
- planner/executor/reviewer role
- correction cycle
- actual usage/cost capture
- routing evidence tests

### Slice D — Experiment + verified savings

- same-cohort baseline/candidate comparison
- quality/evaluation gates
- normalized economics
- confidence metadata
- verified-savings integration

### Slice E — Route Lab UI

- orchestration profile editor
- baseline vs delegated scenario
- estimated vs actual economics
- route provenance
- quality and acceptance result
- verified-savings status

### Slice F — Provider-neutral execution adapter

Create an adapter interface so the product can support Codex-style subagents, agent SDKs, or other execution backends without coupling the domain model to one CLI.

The adapter must expose authoritative route metadata from the execution/gateway layer.

## Acceptance criteria for the reverse-engineered capability

- No new parallel gateway, policy engine, telemetry ledger, experiment system, or savings ledger.
- Provider/model names are configuration, not architecture.
- Required routes fail closed.
- Worker-reported model identity is not accepted as proof.
- High-risk work can require premium review or premium-only execution.
- Every role emits authoritative usage receipts.
- Baseline and candidate can be compared on the same evaluation cohort.
- Savings are labeled estimated until quality-gated experiment evidence exists.
- Verified savings preserve pricing and route provenance.
- UI makes planner/executor/reviewer economics understandable.
- Unit, integration, and end-to-end tests cover fail-closed routing, policy escalation, telemetry linkage, and savings verification.

## First implementation target

The smallest useful production-shaped slice is:

1. provider-neutral orchestration profile + task/evidence schemas;
2. role metadata on gateway receipts;
3. exact-route/fail-closed policy evaluation;
4. Route Lab estimation for premium-only vs premium+executor;
5. experiment linkage to existing verified-savings evidence.

This gives Token Intelligence the reusable orchestration economics primitive without prematurely building a second autonomous coding agent.
