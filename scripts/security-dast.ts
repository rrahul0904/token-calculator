export {};

const baseUrl = process.env.SECURITY_BASE_URL ?? "http://127.0.0.1:3000";

const secretPatterns = [
  /postgres:\/\//i,
  /sk_(?:live|test)_/i,
  /whsec_/i,
  /WORKOS_API_KEY/i,
  /TOKEN_INTELLIGENCE_ENCRYPTION_KEY/i,
  /BEGIN (?:RSA )?PRIVATE KEY/i,
];

type Check = {
  name: string;
  run: () => Promise<void>;
};

function url(path: string) {
  return new URL(path, baseUrl).toString();
}

async function body(response: Response) {
  return await response.text();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoSecrets(value: string, label: string) {
  for (const pattern of secretPatterns) {
    assert(!pattern.test(value), `${label} leaked sensitive material matching ${pattern}`);
  }
  assert(!/\n\s+at\s+.+\(.+\)/.test(value), `${label} leaked a server stack trace`);
}

const checks: Check[] = [
  {
    name: "security headers",
    async run() {
      const response = await fetch(url("/"), { redirect: "manual" });
      assert(response.status === 200, `home returned ${response.status}`);
      assert(!response.headers.has("x-powered-by"), "x-powered-by must be disabled");
      assert(response.headers.get("x-content-type-options") === "nosniff", "missing nosniff");
      assert(response.headers.get("x-frame-options") === "DENY", "missing DENY frame policy");
      const csp = response.headers.get("content-security-policy") ?? "";
      assert(csp.includes("default-src 'self'"), "CSP default-src is missing");
      assert(csp.includes("frame-ancestors 'none'"), "CSP frame-ancestors is missing");
      assert(csp.includes("object-src 'none'"), "CSP object-src is missing");
    },
  },
  {
    name: "anonymous session endpoints fail closed",
    async run() {
      const read = await fetch(url("/api/v1/api-keys"), { redirect: "manual" });
      assert(read.status === 401, `anonymous api-key read returned ${read.status}`);

      const write = await fetch(url("/api/v1/projects"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "security-probe", description: "must not persist" }),
        redirect: "manual",
      });
      assert(write.status === 401, `anonymous project creation returned ${write.status}`);
    },
  },
  {
    name: "malformed OAuth callback is rejected",
    async run() {
      const response = await fetch(url("/auth/callback?code=invalid-without-state"), { redirect: "manual" });
      assert(response.status === 400, `malformed auth callback returned ${response.status}`);
      assertNoSecrets(await body(response), "malformed auth callback");
    },
  },
  {
    name: "encoded traversal remains bounded",
    async run() {
      const response = await fetch(url("/api/v1/models/%2e%2e/%2e%2e/etc/passwd"), { redirect: "manual" });
      assert(response.status >= 400 && response.status < 500, `traversal probe returned ${response.status}`);
      assertNoSecrets(await body(response), "traversal response");
    },
  },
  {
    name: "oversized public query stays available",
    async run() {
      const oversized = "9".repeat(20_000);
      const response = await fetch(url("/?tokens=" + oversized), { redirect: "manual" });
      assert(response.status < 500, `oversized query returned ${response.status}`);
    },
  },
  {
    name: "health response is metadata-only",
    async run() {
      const response = await fetch(url("/api/health"), { redirect: "manual" });
      assert(response.status < 500, `health returned ${response.status}`);
      assertNoSecrets(await body(response), "health response");
    },
  },
];

let failures = 0;
for (const check of checks) {
  try {
    await check.run();
    console.log(`PASS  ${check.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  console.error(`${failures} defensive DAST check(s) failed`);
  process.exitCode = 1;
} else {
  console.log(`PASS  defensive DAST (${checks.length} checks)`);
}
