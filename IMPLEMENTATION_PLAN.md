# Token Intelligence — implementation plan

This plan reflects the current repository state as of September 4, 2026.

External services such as WorkOS, Stripe, provider credentials, scheduled pricing sources, or production databases may still require environment-specific configuration. A module being present in the repository does not imply every external integration is configured in every deployment.

---

# Foundation — Public Token Intelligence ✅

Implemented:
- privacy-first browser tokenization
- token-piece visualization
- token/word/character metrics
- model pricing catalog
- input/cached-input/cache-write/output cost math
- context-window planning
- long-context pricing
- monthly cost forecasting
- model economics estimates
- searchable model catalog
- Cost Lab
- token ↔ word planning
- GPU/VRAM planner
- speed/TTFT simulator
- public tokenize API
- developer documentation
- responsive public UI
- pricing/packaging surface

---

# SaaS / FinOps foundation — present in repository ✅ / configuration-dependent

The current main branch contains application and library foundations for:
- authentication
- PostgreSQL/Drizzle
- organizations/projects
- API keys
- billing
- usage
- agent runs
- budgets
- integrations
- alerts/webhooks
- policy engine
- governed gateway
- provider credentials/connectivity
- quotas/rate limits
- MCP
- collectors
- audit/enterprise/security modules
- agent economics estimates
- production observability

These foundations must be preserved and extended rather than rebuilt.

---

# Next wave — Shareable Workload Economics & Pricing Intelligence

Reference benchmark:
`https://tokencalc-seven.vercel.app/?model=glm-5.3-flash&mode=tokens2cost&tokens=1000000000&input=99&cache=98`

Detailed plans:
- `docs/TOKENCALC_SEVEN_REVERSE_ENGINEERING.md`
- `docs/TOKENCALC_SEVEN_PRODUCT_LOGIC_FEATURE_PLAN.md`
- `docs/CODEX_TOKENCALC_SEVEN_VIBE_REVERSE_ENGINEERING_PROMPT.md`

## Gate 0 — Reconcile current state
- inspect current main branch before implementation
- produce feature gap matrix
- identify partial/configuration-dependent paths
- update stale docs
- avoid duplicate schemas/modules

## Gate 1 — Canonical workload economics engine
- total-token workload model
- input/output percentage split
- simple cache-hit compatibility mode
- advanced cacheable % vs cache-hit model
- cached-read/cache-write economics
- reasoning/multimodal extension points
- large-number safety
- transparent breakdowns
- reverse cost → token calculation
- deterministic unit tests

## Gate 2 — Shareable public Cost Lab
- reference-compatible query params
- tokens → cost
- cost → tokens
- model search
- endpoint selection where supported
- pinned baseline
- share/copy URL
- URL round-trip/back-forward behavior
- mobile/accessibility hardening

## Gate 3 — Versioned pricing intelligence
- official-provider source adapters
- OpenRouter source adapter
- normalized model/endpoint prices
- immutable pricing snapshots
- provenance
- last-verified/staleness state
- approximately six-hour refresh cadence where source terms allow
- failure-safe last-known-good publication
- auditable manual overrides

## Gate 4 — Model + provider endpoint economics
- canonical model identity
- inference endpoint identity
- same-model/different-provider comparison
- provider-specific pricing
- context override support
- optional observed latency/throughput/uptime
- evidence labels for all performance data

## Gate 5 — Workload comparison intelligence
- workload presets
- pinned-model comparison
- constraint-aware recommendations
- evidence-backed quality adapters
- cost/quality efficiency frontier
- Pareto-efficient alternatives
- cheapest qualifying model under quality/context/budget constraints

## Gate 6 — Connect planning to actual FinOps
- save scenarios to projects
- immutable scenario versions
- pricing snapshot linkage
- estimate vs actual reconciliation
- variance attribution
- convert forecast to budget baseline
- link workloads to run receipts
- advisory recommendation handoff to policy/gateway

## Gate 7 — Production hardening
- anonymous rate limiting
- organization isolation
- migration safety
- performance
- observability
- privacy
- provider-source failure handling
- CI
- E2E/browser verification
- documentation/runbook

---

# Following wave — Verified AI Cost Optimization

Once workload planning and versioned pricing are production-ready:

- recommendation evidence model
- savings opportunity detection
- verified before/after savings
- context duplication detection
- cache optimization recommendations
- model downgrade candidates
- endpoint routing optimization
- batch pricing recommendations
- output-control recommendations
- anomaly detection
- pricing-change impact analysis
- automated budget forecasting

Core rule:
**A cheaper recommendation is not a successful optimization unless required quality/outcome is preserved.**

---

# Enterprise expansion

Continue hardening:
- SSO
- SCIM
- RBAC
- service accounts
- audit logs
- SIEM export
- retention controls
- regional/dedicated deployments
- enterprise onboarding
- SLA/security documentation
- showback/chargeback
- policy templates
- governed routing
- approval workflows

---

# Product destination

Token Intelligence should evolve from:

> “How many tokens will this cost?”

to:

> **“What will this workload cost, which model/provider endpoint gives the best economics for my requirements, what did production actually spend, why did it differ, and what should the platform enforce next?”**

Closed loop:

```
PLAN
  ↓
COMPARE
  ↓
OBSERVE
  ↓
RECONCILE
  ↓
OPTIMIZE
  ↓
ENFORCE
  ↓
VERIFY
```
