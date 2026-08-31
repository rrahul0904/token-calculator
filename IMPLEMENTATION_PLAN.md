# Token Intelligence implementation plan

## Wave 1 — Production calculator ✅

Implemented:

- local browser tokenization
- model pricing catalog
- input/cache/output cost math
- context-window planning
- monthly cost forecasting
- responsive UI
- production Vercel deployment

## Wave 1B — Token-Calculator.net competitive parity ✅

Implemented clean-room equivalents of useful observable features from the public reference product:

- token-piece visualization
- no-space and total character counts
- full searchable model pricing table
- automatic long-context tiers
- dedicated cost calculator / workload presets
- token ↔ word converter
- GPU RAM / VRAM calculator
- token-speed and TTFT simulator
- public-beta token-count API
- developer API documentation
- dark/light theme
- expanded application navigation
- Free / Pro / Team / Enterprise pricing packaging

Improvements over the reference:

- xAI and DeepSeek coverage
- shared schema-driven long-context pricing
- conservative tokenizer precision labels
- TTFT separated from decode speed
- explicit browser-vs-server privacy boundary

## Wave 2 — SaaS foundation

- authentication
- PostgreSQL
- users and organizations
- projects and saved scenarios
- prompt comparison history
- Stripe subscriptions
- billing portal
- plan entitlements
- hashed API keys
- quotas and usage records
- Cost Lab workspace redesign

## Wave 3 — Developer and coding-agent integrations

- authenticated Streamable HTTP MCP server
- OAuth
- Codex integration
- Claude Code integration
- Cursor integration
- Google Antigravity integration
- TypeScript SDK
- Python SDK
- CLI
- GitHub Action / CI integration

Core MCP/API capabilities:

- estimate cost
- compare models
- check context
- recommend model
- check budget
- record usage
- retrieve usage
- identify savings opportunities

## Wave 4 — AI gateway / FinOps

- OpenAI-compatible and provider-specific gateway
- BYOK credentials
- actual usage reconciliation
- budgets
- model allowlists
- policy enforcement
- rate limits
- routing
- fallbacks
- estimated-vs-actual spend

## Wave 5 — Enterprise

- SSO
- SCIM
- RBAC
- service accounts
- audit logs
- SIEM export
- retention controls
- dedicated deployments
- enterprise onboarding
- SLA and security documentation
