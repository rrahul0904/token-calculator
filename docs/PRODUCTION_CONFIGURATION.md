# Token Intelligence Production Configuration

## Existing resources only

- Vercel project: `token-intelligence` / `prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`
- Production origin: `https://token-intelligence-eight.vercel.app`
- Neon project: `restless-queen-06517393`
- WorkOS Production environment: `environment_01M1G0NZHV4J3CNS2WQZB2JER4`
- Stripe account context: `acct_1QrNa7RB8OGmEnBw`

Do not create replacement projects to bypass configuration blockers.

## GitHub Actions deployment credentials

Repository or environment secrets required by the release workflows:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID` — must equal `prj_ADoR3dW8VcpJOaQcagZXOpioyM7l`
- `VERCEL_AUTOMATION_BYPASS_SECRET` — optional; required only when Preview Deployment Protection blocks release automation.

The token/bypass values are used only by release automation and are never printed.

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

Optional integrations remain optional and do not silently become launch-critical.

## Release-test AuthKit accounts

Real authentication certification does not use `TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED`.

Store a dedicated low-privilege release-test account in the relevant Vercel environment as server-only values:

- `RELEASE_AUTH_EMAIL`
- `RELEASE_AUTH_PASSWORD`

The release workflows load these only through `vercel env run` and execute `npm run release:verify:auth`. The verifier does not print credentials and checks hosted sign-in, callback/session establishment, workspace access, sign-out, and post-sign-out protection.

For the one-time first-user onboarding certification, use a fresh low-privilege account through:

- `RELEASE_ONBOARDING_AUTH_EMAIL`
- `RELEASE_ONBOARDING_AUTH_PASSWORD`

Then run `npm run release:verify:onboarding -- --base-url=<certified deployment>`. The command must not be reused with a user that is already onboarded.

## WorkOS public Production values

After WorkOS Production is activated:

- Redirect URI: `https://token-intelligence-eight.vercel.app/auth/callback`
- Logout URI: `https://token-intelligence-eight.vercel.app/`
- Web origin: `https://token-intelligence-eight.vercel.app`
- Sign-in URL: `https://token-intelligence-eight.vercel.app/sign-in`
- Directory webhook: `https://token-intelligence-eight.vercel.app/api/webhooks/workos`
- MCP resource: `https://token-intelligence-eight.vercel.app/mcp`

The strict WorkOS verifier accepts `WORKOS_PRODUCTION_STATE`, `WORKOS_BILLING_ADDRESS_CONFIGURED` and `WORKOS_PAYMENT_METHOD_CONFIGURED` as non-secret operator evidence for dashboard-only account state. It fails closed when that state is unknown.

## Build identity

`GET /api/build` returns only non-sensitive deployment identity:

- application/version
- Git SHA
- environment
- deployment ID/URL
- build timestamp

The Preview workflow injects the exact Git SHA at build time. Certification fails if the endpoint does not match the requested SHA or if Vercel does not expose a deployment ID. Preview security URLs use the exact `VERCEL_URL`; SEO canonical URLs intentionally continue to use the stable Production host.

## Secret handling

Never commit or echo server credentials. Provider tooling prints only readiness state, non-secret IDs and expected public URLs. Full-history Gitleaks remains part of CI and Release Preview.
