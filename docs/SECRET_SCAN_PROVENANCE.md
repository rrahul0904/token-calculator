# Full-history secret scan provenance

Inspected on 2026-10-01 with Gitleaks v8.24.3, default rules extended by
`.gitleaks.toml`, `--redact`, and `--log-opts="--all"`.
The initial scan included 1,184 commits and reported exactly two findings:

| Rule | Commit | Path | Fingerprint line | Classification |
| --- | --- | --- | --- | --- |
| curl-auth-header | 8364708f1b45bbbb230548effc311f37ee778639 | apps/route-gateway-pilot/README.md | 26 | Synthetic documentation placeholder |
| curl-auth-header | 8364708f1b45bbbb230548effc311f37ee778639 | apps/route-gateway-pilot/public/index.html | 2 | Synthetic documentation placeholder |

Both matches contain the literal `YOUR_GATEWAY_TENANT_KEY` in generated/example
curl commands. The README explicitly instructs replacement with a provisioned
key. The static HTML generates an example locally; it neither provisions nor
authenticates this value. There is no credential to revoke in these matches.
Gitleaks reports a multiline match start in the README; the bearer header itself
appears on the following line.

`.gitleaksignore` lists only these complete commit/path/rule/line fingerprints.
The general bearer-placeholder regex introduced on PR #52 is removed. New
matches, different paths, different commits and different rules remain subject
to detection. Existing WorkOS fixture exceptions are preserved and are not
expanded. No shared history is rewritten.

Pre-commit final verification on 2026-10-01 used the official Gitleaks v8.24.3
macOS binary (published SHA-256 verified), scanned all 1,198 fetched commits
and the current working tree, and reported no leaks. The immutable candidate
commit is rescanned after creation; its result is recorded in the task closeout.

Reproduce from a complete checkout (including fetched donor branches):

```sh
gitleaks detect --source=. --config=.gitleaks.toml --redact \
  --exit-code=2 --log-opts=--all
```

Do not print raw report `Secret` or `Match` fields. GitHub Actions must rerun on
the final release SHA; a local scan does not certify remote CI or deployment.
