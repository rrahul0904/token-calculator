# OpenProfit donor — revenue-aware unit economics reverse-engineering dossier

Date: 2026-10-09
Tracker: GitHub issue #67
Implementation branch: `reverse/openprofit-unit-economics`
Integration base: reconciliation PR #53, `codex/token-intelligence-reconciliation-20261001@9f918e8d2753ca07e8026c30b13005f4f176bf67` (repository CI + Security CodeQL green before this slice)
Disposition: capability donor to Token Intelligence; **not** a standalone clone.

## 1. Source identification

Primary public evidence:

- Reddit intake: `r/SideProject` — “I got tired of adding up 6 billing pages to see if my SaaS was actually profitable...”
- Earlier creator feedback thread: `r/SaaS` — “My SAAS is making $175 MRR but $42 went to API and hosting bills...”
- Product/demo: `openprofit.dev` / `openprofit.dev/demo`
- Public repository: `github.com/lobbystack/openprofit`
- Upstream license: MIT

The upstream repository is useful because it allows us to verify behavior and architecture rather than infer from screenshots. Token Intelligence still implements the selected capability independently in its own domain model and architecture.

## 2. Verified donor product model

OpenProfit joins revenue-provider data with infrastructure/API/provider bills, maps economic lines to products, and reports what each product keeps after costs.

Verified public behaviors include:

- revenue from Stripe, Polar, Paddle, Lemon Squeezy and RevenueCat;
- costs from OpenAI, Anthropic, OpenRouter, Vercel, Cloudflare, Railway, DigitalOcean, GitHub, Twilio, Firecrawl, Resend, xAI, Neon, MongoDB Atlas and manually entered flat costs;
- processor fees and refunds deducted before net revenue is displayed;
- provider sub-unit to product mapping with an explicit Unassigned bucket;
- daily/base-currency normalization;
- product profitability, MRR, customers/subscriptions and provider cost breakdowns;
- cost-spike, margin-floor and sync-failure alerts;
- weekly finance summary;
- monthly journal/accounting exports and tax-oriented mappings;
- hosted and self-hosted operation.

The upstream implementation is a TanStack Start modular monolith using Drizzle/Postgres, PGlite for embedded self-hosting/local development, Better Auth, Tailwind, in-process cron scheduling and an MCP server dependency. Connector credentials are described as AES-GCM encrypted. Provider data is upserted by provider external IDs to make range replay idempotent.

## 3. Important upstream weakness

The upstream engineering guide explicitly states that there is no general automated test suite. It relies on browser/build verification, with assertion scripts around the Books surface.

Token Intelligence must not inherit this weakness. Any adopted finance semantics must be deterministic and unit-tested before persistence, connectors or UI are added, and the repository's existing full CI/release gates remain authoritative.

## 4. User feedback reconstruction

The earlier public discussion exposes the real problem more clearly than the marketing surface.

### 4.1 Average provider cost hides customer-level margin risk

A low-price customer can generate substantially more API cost than a higher-price customer. Therefore product-level monthly profit is necessary but not sufficient. Customer, plan/tier and workload/task profitability must be first-class dimensions.

### 4.2 Paid COGS must be separated from growth and development spend

Free/trial traffic, testing and R&D can consume the same provider account as paid production traffic. Mixing those costs into one monthly provider number makes the serving margin of the paid product misleading.

Token Intelligence therefore needs an explicit cost-purpose taxonomy rather than inferring purpose from provider or project name.

### 4.3 Cost per completed task/outcome matters for agentic products

Agent retries, long contexts, cache misses and premium fallbacks can make one task much more expensive than another. Token Intelligence already owns run/task/outcome evidence, so it can extend the donor concept beyond a finance dashboard into operational unit economics.

### 4.4 Shared spend must stay shared until allocation is evidenced

A provider bill or infrastructure resource may serve multiple products/customers. Silent equal splitting is not finance-grade evidence. Shared/unassigned spend should stay explicit until a declared allocation rule or telemetry signal exists.

## 5. Competitive positioning

CloudZero's current unit-economics model treats cost per customer, transaction, API call, product and feature as first-class metrics and combines billing data with telemetry for shared/multi-tenant allocation. This confirms that unit economics requires business context beyond provider invoices.

Token Intelligence's differentiator should not be another generic cloud-cost dashboard. Its stronger position is:

> Revenue-aware unit economics joined to AI run/task/outcome evidence, with explicit provenance, reconciliation, control and verification.

That gives a path from “what did OpenAI cost?” to:

- what did customer A cost to serve?
- what did plan Pro contribute after fees/refunds and paid-serving costs?
- which task/outcome drove the margin loss?
- was the cost measured, estimated or reconciled?
- was spend paid-serving, free/trial, acquisition, R&D/testing, shared or fixed overhead?
- what policy should control the next run without degrading outcome quality?

## 6. Existing Token Intelligence primitives

Do not duplicate these capabilities:

- `src/lib/finops/finance.ts`: showback by organization/team/project/environment/user/service/API key/agent/workflow/provider/model/run/outcome/cost center, month-end forecast, provider-spend reconciliation and weekly brief;
- FinOps anomalies and budget risk;
- provider usage imports and cost provenance;
- run/task/outcome economics;
- gateway/policy/budget control;
- MCP/API/SDK surfaces;
- organization/project/auth boundaries;
- repository-wide secret scan, dependency audit, lint, typecheck, tests, migrations, DB integration, SDK/CLI checks, build, DAST and Playwright production smoke.

The new capability must compose with these primitives instead of replacing them.

## 7. MATCH / IMPROVE / NEW / OMIT

### MATCH

Reuse existing Token Intelligence provider/run cost evidence, reconciliation, dimensions, budget/anomaly engine, weekly brief, tenant boundary, MCP/API and release gates.

### IMPROVE

Go beyond the donor with:

- customer and plan/tier profitability;
- task/outcome unit economics;
- explicit cost-purpose classification;
- contribution margin distinct from operating profit;
- incomplete/unknown economics represented as incomplete, never zero;
- explicit shared/unassigned spend;
- evidence/provenance counts;
- AI retry/cache/context/fallback economics linked to product/customer margin.

### NEW

Later add normalized revenue events, subscription snapshots, flat costs, durable allocation rules, FX/base currency, accounting journals and carefully source-versioned tax-oriented summaries.

### OMIT / DEFER

Do not copy donor branding/UI/copy, do not replace our Next.js/Postgres architecture, do not implement every connector in the first wave, and do not claim accounting/tax correctness or production readiness without separate evidence.

## 8. Phase A behavior contract

Phase A is deliberately pure-domain logic. It introduces no database migration, credential, provider call or UI.

An economic line has:

- a non-negative monetary magnitude or explicit `null` when unknown;
- an economic role: gross revenue, processor fee, refund, variable cost or fixed cost;
- optional product/customer/plan/task/provider dimensions;
- a cost-purpose classification for cost lines;
- an evidence class.

Sign is never encoded by allowing arbitrary negative amounts. The role determines the accounting direction. This removes double-negative and refund/fee ambiguity.

Definitions:

```text
net revenue
  = gross revenue
  - processor fees
  - refunds

contribution profit
  = net revenue
  - paid-service variable cost

operating profit
  = net revenue
  - all variable cost
  - all fixed cost
```

Contribution margin deliberately excludes free/trial, acquisition, R&D/testing and fixed-overhead spend. Shared or unclassified variable spend makes contribution margin incomplete until its purpose is resolved. Operating profit can still be complete if all monetary values are known because purpose does not change total cost.

If a relevant monetary component is unknown, the engine returns the known subtotal plus explicit unknown-row counts and withholds the complete metric. Unknown is not converted to zero.

## 9. Phase A acceptance gates

The implementation must prove:

- fees and refunds reduce net revenue exactly once;
- null values remain unknown;
- contribution and operating profit use different, explicit cost boundaries;
- shared/unclassified variable cost blocks a complete contribution-margin claim;
- shared/unassigned dimension values remain visible rather than redistributed;
- product/customer/plan/task/provider grouping is deterministic;
- negative and non-finite magnitudes fail closed;
- zero net revenue cannot produce infinite margin;
- evidence counts remain observable;
- existing FinOps behavior does not regress.

Repository CI remains the certification gate.

## 10. Phase B and later

After Phase A passes exact-head CI:

1. design durable revenue/economic-line schema and migrations;
2. implement Stripe revenue ingestion first with idempotency and source reconciliation;
3. link Stripe customers/subscriptions/products to Token Intelligence project/workload identities;
4. expose customer/plan/product/task/outcome profitability through authenticated API/UI;
5. add flat costs and explicit shared-allocation policies;
6. add additional revenue connectors only behind contract tests and real-provider verification;
7. add FX normalization with dated rate provenance;
8. add journal/accounting export;
9. treat jurisdiction-specific tax mappings as a separately reviewed, source-versioned reporting aid rather than tax advice or filing automation.

## 11. Non-claims

This work does not claim OpenProfit parity, connector parity, accounting correctness, tax correctness, live provider verification, hosted certification, or production deployment. Those claims require their own exact evidence and release receipts.
