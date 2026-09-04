# Token Intelligence

Token Intelligence is a privacy-first **AI FinOps + ContextOps + Agent Observability + Economics Control Plane**.

Its operating loop is:

**ESTIMATE → TRACE → RECONCILE → CONTROL → OPTIMIZE → VERIFY OUTCOME**

The public calculator remains local-first. Prompt text, source code, and raw tool output are not persisted by default. Unknown provider cost is represented as unknown, never as `$0`.

This repository is a clean-room implementation based on public product behavior and public provider/platform APIs. It does not copy proprietary source code, branding, visual assets, or undisclosed competitor implementation details.

## Product surface

### Public planning tools

- browser-local tokenization and token visualization
- searchable model/pricing catalog with source metadata
- input/cache/output cost estimates and request-volume forecasting
- context-window planning and modeled long-context pricing
- local batch analysis for supported text-like files
- content-free share state
- Cost Lab model/workload comparison
- token↔word, memory/VRAM, and latency/speed planning tools

### Authenticated control plane

- WorkOS/AuthKit organizations and RBAC
- PostgreSQL-backed projects, teams, scenarios, usage, runs, audit, budgets, policies, alerts, evaluations, and FinOps data
- service accounts and one-time-display hashed API keys
- API-key quotas and PostgreSQL-backed shared rate limiting
- Stripe subscription/entitlement architecture and Customer Portal integration
- provider BYOK vault using AES-256-GCM with tenant/provider/credential/version-bound AAD
- provider connection verify/rotate/revoke flows
- configurable metadata retention and audited data controls

### Agent economics and observability

- Agent Run Receipts
- Codex, Claude Code, Cursor, and Antigravity collectors
- durable collector checkpoint foundations and normalized metadata-only ingestion
- provider usage import/reconciliation foundations
- deterministic findings/waste engine
- anomaly detection and FinOps views
- prompt/config version attribution, datasets, experiments, and route-analysis foundations
- GitHub outcome attribution
- content-free OpenTelemetry export

Usage provenance remains explicit:

- `provider_measured`
- `agent_measured`
- `local_tokenizer_reference`
- `estimated`
- `reconciled`

Cursor usage remains `estimated` when provider-billed usage is unavailable.

### Governed provider gateway

The Token Intelligence-native gateway supports governed OpenAI, Anthropic, and Gemini execution with:

- encrypted BYOK credentials
- tenant/project/API-key validation
- preflight economics
- budgets and policies
- approval/block decisions
- shared rate limiting and monthly quotas
- bounded retry/fallback behavior
- streaming
- provider usage reconciliation
- run receipts
- signed alerts
- OpenTelemetry

Drop-in compatibility routes are also available for adoption by existing clients:

- `POST /v1/responses`
- `POST /v1/chat/completions`
- `POST /v1/messages`

These compatibility routes still pass through the authoritative Token Intelligence governance path; they are not bypasses.

### MCP

`POST /mcp` exposes the Token Intelligence MCP server.

Supported authentication paths:

- Token Intelligence API keys with `mcp:tools`
- WorkOS/AuthKit OAuth resource-server tokens when MCP OAuth is configured

Protected-resource discovery is served from:

- `GET /.well-known/oauth-protected-resource`

MCP budget checks are advisory. Hard enforcement only occurs when provider traffic passes through the governed gateway.

### SDK and CLI

- TypeScript SDK under `packages/sdk-typescript`
- Python SDK under `packages/sdk-python`
- `ti` CLI for estimates, comparisons, collectors, run inspection, sync, and budget/gateway workflows

Raw coding-agent transcripts remain local by default; collectors upload normalized telemetry, not source/prompt contents.

## Privacy and data-region posture

The production privacy default is `metadata_only`.

The data-control model recognizes:

- `metadata_only` — available
- `redacted_content` — unavailable until its storage/deletion/export guarantees are implemented end to end
- `full_content` — unavailable until its storage/deletion/export guarantees are implemented end to end
- `customer_managed_storage` — unavailable until a verified customer-managed storage path exists

The UI/API must not claim data residency merely because a region was requested. Residency is only reported as verified when requested, configured, and actual deployment regions agree.

## Enterprise identity

WorkOS provides the identity layer. The codebase includes:

- organization-scoped SSO/Directory status
- signed WorkOS webhook verification
- idempotent Directory lifecycle processing
- least-privilege Directory user provisioning
- Directory group → Token Intelligence team mapping
- owner protection during deprovisioning
- explicit cross-tenant Directory mapping rejection

Actual customer SSO/Directory activation remains account configuration and must be verified against the deployed WorkOS environment.

## Run locally

Requires Node.js 22.x and PostgreSQL for authenticated/control-plane features.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

The public calculator works without account infrastructure. Authenticated features require the environment described in `.env.example`.

## Database

Migrations are applied in order from `drizzle/*.sql` with a migration ledger, checksum validation, a PostgreSQL advisory lock, and transactional execution.

```bash
npm run db:migrate
npm run db:verify
```

`db:verify` validates the complete current schema, migration ledger, critical quota/tenant triggers, and foreign-key inventory. A migration file existing in Git does not prove that a deployed database has been migrated.

## Verification

Core release verification:

```bash
npm run lint
npm run typecheck
npm test
npm run db:check
npm run db:migrate
npm run db:verify
TOKEN_INTELLIGENCE_INTEGRATION_TESTS=1 npm run test:integration
npm run sdk:build
npm run build
npm run test:e2e
```

GitHub Actions additionally performs a full-history secret scan, starts PostgreSQL 18, seeds an explicitly gated disposable authenticated E2E tenant, starts the production Next.js server, exercises the CLI, and runs desktop/mobile Playwright tests.

A green CI run is necessary but not sufficient for production readiness. Real Neon, WorkOS, Stripe, Vercel, auth, webhook, and production health evidence are separate release gates.

## Deployment status

The repository contains the implementation required for the production control plane, but deployment readiness must be assessed from the currently deployed environment—not inferred from source code or Vercel `READY` status.

Before promotion require, at minimum:

- exact candidate SHA has green CI
- Preview is built from that exact SHA
- Preview PostgreSQL is configured and migrated
- `/api/health` reaches the real database
- WorkOS sign-in/callback is verified
- authenticated workspace and tenant isolation are verified
- Stripe test-mode billing is verified when billing is in release scope
- MCP and gateway contracts are verified
- production environment values are separate from Preview
- production database migration/rollback is prepared
- post-deploy smoke tests pass

See `docs/PRODUCTION_RUNBOOK.md`, `docs/PRIVACY.md`, and `docs/REVERSE_ENGINEERING_COVERAGE_MATRIX.md`.

## Security

See `SECURITY.md`. Never place provider, Stripe, WorkOS, database, webhook, or encryption secrets in `NEXT_PUBLIC_*` variables or in source control.

## Reverse-engineering coverage

`docs/REVERSE_ENGINEERING_COVERAGE_MATRIX.md` tracks feature disposition and evidence. Documentation, schema-only support, or a mock-only integration do not count as a live production feature.
