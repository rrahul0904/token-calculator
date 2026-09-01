# Deployment record

## Production baseline

- Vercel project: `token-intelligence`
- Stable production URL: `https://token-intelligence-eight.vercel.app`
- Production deployment: `dpl_G6FJ8Wte3vFM9a9scauPXngdyvLH`
- Region: `iad1`
- Baseline production build: READY

The baseline production deployment passed optimized Next.js compilation, TypeScript validation, page-data collection, and static generation.

## Competitive-parity preview

A newer preview containing the Token-Calculator.net parity wave is READY:

- Deployment: `dpl_LJDhNiFcggGVZsU9nAHFsN4uJgZA`
- Preview: `https://token-intelligence-lena6z9xs-rrahul0904-5013s-projects.vercel.app`
- Next.js: 16.3.3
- Build result: PASS
- TypeScript: PASS
- Static/dynamic route generation: PASS

Validated routes in this preview include:

- `/`
- `/api/v1/tokenize`
- `/developers`
- `/models`
- `/pricing`
- `/robots.txt`
- `/sitemap.xml`
- `/tools/cost`
- `/tools/memory`
- `/tools/speed`
- `/tools/tokens-words`

The parity preview compiled successfully and generated all application routes. It has not yet replaced the stable production alias in this record.

## CI caveat

GitHub Actions jobs for this repository have repeatedly been created without a runner and with zero executed steps. Those checks fail before checkout and therefore do not demonstrate an application test/build failure. Vercel has provided an independent clean build environment and has caught real TypeScript issues when present.

## Remaining deployment hardening

1. Connect the Vercel project to the GitHub repository.
2. Resolve the GitHub Actions runner/account issue.
3. Promote the current parity build after final smoke testing.
4. Enable PR preview deployments automatically through Git integration.
