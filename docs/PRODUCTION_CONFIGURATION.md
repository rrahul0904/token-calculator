# Token Intelligence Production Configuration

## Existing resources only

- Vercel project: `token-intelligence` / `prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`
- Vercel team: `team_zmEezpOKGZy2sH5nqTfO44LD`
- Production origin: `https://token-intelligence-eight.vercel.app`
- Neon project: `restless-queen-06517393`
- WorkOS Production environment: `environment_01M1G0NZHV4J3CNS2WQZB2JER4`
- WorkOS Staging environment: `environment_01M1G0NYZ6EX1MR9Z51Y7VZ15X`
- Stripe account context: `acct_1QrNa7RB8OGmEnBw`

Do not create replacement projects to bypass configuration blockers.

## GitHub Actions deployment credentials

The release workflows intentionally keep the GitHub secret surface small.

Required repository/environment secret:

- `VERCEL_TOKEN` — scoped token able to read project environment variables, build/deploy the existing project, inspect logs and promote/rollback deployments.

Optional secret:

- `VERCEL_AUTOMATION_BYPASS_SECRET` — required only when Vercel Deployment Protection blocks release automation.

`VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are non-secret workflow constants and are pinned to the existing team/project.

The workflows do **not** require persistent `RELEASE_AUTH_*` credentials. They provision verified, password-based WorkOS users inside the target WorkOS environment through that environment's `WORKOS_API_KEY`, mask the generated credentials before exposing step outputs, run real AuthKit certification, and delete the temporary users with `if: always()` cleanup. Preview creates separate auth and first-user-onboarding identities; Production creates only an auth identity.

GitHub `production` environment variables used as non-secret WorkOS dashboard evidence:

- `WORKOS_PRODUCTION_STATE=active`
- `WORKOS_BILLING_ADDRESS_CONFIGURED=true`
- `WORKOS_PAYMENT_METHOD_CONFIGURED=true`

Set those values only after the corresponding WorkOS account state has actually been verified.

## Runtime environment contract

The typed contract is `scripts/release/env-contract.ts`. Run:

```bash
npm run env:validate -- --scope=production
```

Production launch-critical variables include:

- `APP_BASE_URL`
- `DATABASE_URL`
- `DATABASE_SSL`
- `WORKOS_API_KEY`
- `WORKOS_CLIENT_ID`
- `WORKOS_COOKIE_PASSWORD`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
- `WORKOS_WEBHOOK_SECRET`
- `WORKOS_AUTHKIT_DOMAIN`
- `MCP_RESOURCE_URI`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_TEAM`
- `TOKEN_INTELLIGENCE_ENCRYPTION_KEY`
- `CRON_SECRET`

Preview uses the Staging WorkOS environment, the persistent Neon validation branch, and Stripe **TEST** mode. Production uses WorkOS Production, Neon Production and Stripe live mode.

Optional integrations remain optional and do not silently become launch-critical. GitHub outcome attribution, OTEL and Redis are not release-readiness gates.

## Ephemeral AuthKit release users

Real authentication certification does not use `TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED`.

`scripts/release/workos-release-users.ts` creates temporary verified password users through WorkOS User Management using the target environment's server-only `WORKOS_API_KEY`. Passwords are generated per workflow run, masked with GitHub's `add-mask` command before step outputs are written, never committed, never deployed as application variables and deleted after certification.

The AuthKit verifier checks hosted sign-in, callback/session establishment, workspace access, sign-out and post-sign-out protection.

The Preview onboarding verifier uses a separate fresh temporary WorkOS identity, creates a uniquely named Preview tenant/project, verifies refresh idempotency, then removes only the generated tenant/user fixture from the Preview validation database. Cleanup requires `RELEASE_ONBOARDING_CLEANUP_ALLOWED=1` and explicitly refuses the stable Production origin. The WorkOS identity is then deleted by the release workflow.

## WorkOS public Production values

After WorkOS Production is activated:

- Redirect URI: `https://token-intelligence-eight.vercel.app/auth/callback`
- Logout URI: `https://token-intelligence-eight.vercel.app/`
- Web origin: `https://token-intelligence-eight.vercel.app`
- Sign-in URL: `https://token-intelligence-eight.vercel.app/sign-in`
- Directory webhook: `https://token-intelligence-eight.vercel.app/api/webhooks/workos`
- MCP resource: `https://token-intelligence-eight.vercel.app/mcp`

The release workflow can idempotently register the exact stable/staged redirect URI and CORS origin through the Production `WORKOS_API_KEY`. Sign-out URI, Sign-in URL and the AuthKit MCP Resource Indicator remain provider configuration that must exist in WorkOS Production.

The strict WorkOS verifier accepts `WORKOS_PRODUCTION_STATE`, `WORKOS_BILLING_ADDRESS_CONFIGURED` and `WORKOS_PAYMENT_METHOD_CONFIGURED` as non-secret operator evidence for dashboard-only account state. It fails closed when that state is unknown. It also queries WorkOS `/webhook_endpoints` and requires the exact Production URL `/api/webhooks/workos`, enabled status, exactly the Directory Sync lifecycle events handled by source code, and a signing secret equal to `WORKOS_WEBHOOK_SECRET`. The secret is compared but never printed.

## Database identity and migration safety

Release automation does not trust a `DATABASE_URL` merely because it connects. It queries Neon runtime settings and requires:

- Preview: project `restless-queen-06517393`, branch `br-small-haze-aeqj7d25`
- Production: project `restless-queen-06517393`, branch `br-muddy-sun-aeyodc4h`

Only after that identity check can the workflow apply forward-only migrations and run checksum/schema verification.

The `0008_workload_pricing_intelligence` DDL has been exercised on the dedicated validation branch. The Production branch intentionally remains on the prior ledger until the gated Production workflow verifies identity and applies the migration.

## Preview billing certification

`npm run release:verify:billing` refuses the stable Production origin and refuses any Stripe key that is not test mode. On Preview it creates a Checkout session and billing portal session, sends signed test-mode subscription lifecycle events through the deployed webhook route, verifies Pro → Team → free entitlement reconciliation, and cleans the synthetic Preview database/Stripe customer fixture when it created one. It never supplies a payment method and reports `charged: false`.

## Staged Production deployment

Vercel Preview promotion is not treated as immutable because Vercel rebuilds a Preview deployment when converting it to Production. The release workflow therefore creates a Production-environment build first, deploys it with `--prod --skip-domain`, certifies its generated deployment URL, and only then promotes that already-Production deployment. The stable Production domain must report the same Vercel deployment ID afterward.

The server-side WorkOS callback resolver permits the exact Vercel system `VERCEL_URL` while a staged Production deployment is being certified, but rejects arbitrary request origins and returns to the canonical Production callback when traffic uses the stable domain.

## Build identity

`GET /api/build` returns only non-sensitive deployment identity:

- application/version
- Git SHA
- environment
- deployment ID/URL
- build timestamp

The Preview workflow injects the exact Git SHA at build time. Certification fails if the endpoint does not match the requested SHA or if Vercel does not expose a deployment ID. Preview security URLs use the exact `VERCEL_URL`; SEO canonical URLs intentionally continue to use the stable Production host.

## Secret handling

Never commit or echo server credentials. Provider tooling prints only readiness state, non-secret IDs and expected public URLs. Ephemeral release-user credentials are masked before GitHub outputs are created and deleted after use. Full-history Gitleaks remains part of CI and Release Preview.
