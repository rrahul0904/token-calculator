import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewServer } from '../src/certification-preview.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40), ADMIN = 'c'.repeat(40);
const env = (extra = {}) => ({
  GATEWAY_CERTIFICATION_PREVIEW: 'FAKE_ONLY',
  GATEWAY_TENANTS_JSON: JSON.stringify({ alpha: A, beta: B }),
  GATEWAY_ADMIN_KEY: ADMIN,
  GATEWAY_CACHE_TTL_SECONDS: '120',
  GATEWAY_CACHE_MAX_ENTRIES: '8',
  GATEWAY_RPM_PER_TENANT: '50',
  ...extra
});
const payload = { model: 'fixture', messages: [{ role: 'user', content: 'synthetic smoke only' }],
  temperature: 0, max_tokens: 24 };

async function launch() {
  const { server } = createPreviewServer(env());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, base: 'http://127.0.0.1:' + server.address().port };
}
async function stop(server) {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
const auth = key => ({ authorization: 'Bearer ' + key });
async function completion(base, key, { cache = false, body = payload } = {}) {
  return fetch(base + '/v1/chat/completions', {
    method: 'POST', headers: { ...auth(key), 'content-type': 'application/json',
      ...(cache ? { 'x-ti-cache': 'exact' } : {}) },
    body: JSON.stringify(body)
  });
}

test('synthetic preview refuses accidental live keys or implicit fake transport', () => {
  assert.throws(() => createPreviewServer(env({ GATEWAY_CERTIFICATION_PREVIEW: '' })), /EXPLICIT_OPT_IN/);
  assert.throws(() => createPreviewServer(env({ OPENAI_API_KEY: 'a-live-secret' })), /REAL_PROVIDER_KEYS_FORBIDDEN/);
  assert.throws(() => createPreviewServer(env({ ANTHROPIC_API_KEY: 'a-live-secret' })), /REAL_PROVIDER_KEYS_FORBIDDEN/);
});

test('real HTTP: health, auth, bounded fake route, cache isolation and process restart', async t => {
  let instance = await launch();
  t.after(async () => { if (instance) await stop(instance.server); });
  let { base } = instance;
  const health = await fetch(base + '/healthz');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).provider_mode, 'synthetic_fixture');
  assert.equal((await fetch(base + '/v1/models')).status, 401);
  const models = await fetch(base + '/v1/models', { headers: auth(A) });
  assert.equal(models.status, 200);
  assert.deepEqual((await models.json()).data.map(model => model.id), ['fixture']);

  // Default requests bypass replay. No live provider credential, egress or paid usage is possible.
  for (let i = 0; i < 2; i++) {
    const response = await completion(base, A);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-ti-cache'), 'BYPASS');
    assert.equal(response.headers.get('x-ti-provider-mode'), 'synthetic_fixture');
    assert.equal(response.headers.get('x-ti-usage-source'), 'synthetic_fixture');
    assert.equal(response.headers.get('x-ti-cost-source'), 'unavailable');
    assert.equal(response.headers.get('x-ti-provider-cost-estimate-usd'), null);
    assert.match((await response.json()).choices[0].message.content, /^SYNTHETIC FIXTURE ONLY:/);
  }

  const first = await completion(base, A, { cache: true });
  assert.equal(first.headers.get('x-ti-cache'), 'MISS');
  const original = await first.json();
  assert.equal(original.usage.total_tokens, 12);
  const replay = await completion(base, A, { cache: true });
  assert.equal(replay.headers.get('x-ti-cache'), 'HIT');
  assert.equal(replay.headers.get('x-ti-usage-source'), 'gateway_replay');
  assert.equal(replay.headers.get('x-ti-cost-source'), 'unavailable');
  assert.equal((await replay.json()).usage.total_tokens, 0);

  const otherTenant = await completion(base, B, { cache: true });
  assert.equal(otherTenant.headers.get('x-ti-cache'), 'MISS');
  assert.equal((await completion(base, B, { cache: true })).headers.get('x-ti-cache'), 'HIT');
  assert.equal((await completion(base, A, { cache: true })).headers.get('x-ti-cache'), 'HIT');

  assert.equal((await completion(base, A, { cache: true, body: { ...payload, stream: true } })).status, 422);
  assert.equal((await completion(base, A, { body: { ...payload, tools: [] } })).status, 422);
  const before = await fetch(base + '/admin/metrics', { headers: auth(ADMIN) });
  const counters = await before.json();
  assert.equal(counters.upstreamCalls, 4); // two BYPASS, alpha MISS, beta MISS
  assert.equal(counters.cacheHits, 3);
  assert.equal(JSON.stringify(counters).includes('synthetic smoke only'), false);

  await stop(instance.server);
  instance = null;
  instance = await launch();
  base = instance.base;
  const afterRestart = await fetch(base + '/admin/metrics', { headers: auth(ADMIN) });
  assert.equal((await afterRestart.json()).upstreamCalls, 0);
  const missAgain = await completion(base, A, { cache: true });
  assert.equal(missAgain.headers.get('x-ti-cache'), 'MISS');
});
