import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.mjs';
import { createApp } from '../src/core.mjs';
import { ExactCache, requestKey } from '../src/cache.mjs';

const TENANT_A = 'a'.repeat(40), TENANT_B = 'b'.repeat(40);
const ADMIN = 'c'.repeat(40);
function env(extra = {}) { return {
  GATEWAY_TENANTS_JSON: JSON.stringify({ alpha: TENANT_A, beta: TENANT_B }),
  GATEWAY_ROUTES_JSON: JSON.stringify({ economy: { provider: 'openai', model: 'gpt-4o-mini', inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 }, prose: { provider: 'anthropic', model: 'claude-example', inputPerMillionUsd: 3, outputPerMillionUsd: 15 } }),
  OPENAI_API_KEY: 'provider-openai-secret', ANTHROPIC_API_KEY: 'provider-anthropic-secret', GATEWAY_ADMIN_KEY: ADMIN, ...extra
}; }
const payload = (model = 'economy', prompt = 'hi') => ({ model, messages: [{ role: 'system', content: 'Be brief' }, { role: 'user', content: prompt }], temperature: 0, max_tokens: 80 });
const providerResponse = () => Response.json({ id: 'up_123', object: 'chat.completion', created: 1, choices: [{ index: 0, message: { role: 'assistant', content: 'Hello.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } });
const anthropicResponse = () => Response.json({ id: 'msg_123', content: [{ type: 'text', text: 'Hi.' }], stop_reason: 'end_turn', usage: { input_tokens: 8, output_tokens: 2 } });
function req(path = '/v1/chat/completions', { tenant = TENANT_A, body = payload(), mode = null, method = 'POST', headers = {} } = {}) {
  return new Request('http://localhost:3000' + path, { method, headers: { authorization: 'Bearer ' + tenant, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...(mode ? { 'x-ti-cache': mode } : {}), ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}

// No dependency on live API accounts; provider transport is injected and assertions inspect actual outbound URL/body.
test('fail-closed config rejects missing tenants, duplicate credentials, missing upstream secrets, unverified rate shapes', () => {
  assert.throws(() => parseConfig({ ...env(), GATEWAY_TENANTS_JSON: '{}' }), /TENANTS_REQUIRED/);
  assert.throws(() => parseConfig({ ...env(), GATEWAY_TENANTS_JSON: JSON.stringify({ alpha: TENANT_A, beta: TENANT_A }) }), /REUSED/);
  assert.throws(() => parseConfig({ ...env(), OPENAI_API_KEY: '' }), /MISSING_OPENAI_API_KEY/);
  assert.throws(() => parseConfig({ ...env(), GATEWAY_ROUTES_JSON: JSON.stringify({ badroute: { provider: 'openai', model: 'x', inputPerMillionUsd: -1, outputPerMillionUsd: 1 } }) }), /RATE_CARD/);
  assert.throws(() => parseConfig({ ...env(), GATEWAY_CACHE_TTL_SECONDS: '301' }), /INVALID_CACHE_TTL/);
  assert.throws(() => parseConfig({ ...env(), GATEWAY_ADMIN_KEY: TENANT_A }), /ADMIN_CREDENTIAL_REUSED/);
});

test('health, public docs, models auth, metrics protection and no prompt in metrics', async () => {
  const app = createApp(parseConfig(env()), { fetchImpl: async () => providerResponse() });
  const health = await app(new Request('http://localhost/healthz')); assert.equal(health.status, 200); assert.equal((await health.json()).storage, 'ephemeral');
  const page = await app(new Request('http://localhost/')); assert.equal(page.status, 200); assert.match(await page.text(), /Route AI calls/);
  const unauth = await app(new Request('http://localhost/v1/models')); assert.equal(unauth.status, 401);
  const models = await app(req('/v1/models', { method: 'GET' })); assert.deepEqual((await models.json()).data.map(x => x.id), ['economy', 'prose']);
  assert.equal((await app(req('/admin/metrics', { method: 'GET' }))).status, 401);
  const admin = await app(req('/admin/metrics', { tenant: ADMIN, method: 'GET' })); assert.equal(admin.status, 200); assert.equal((await admin.json()).scope, 'process_only');
  const disabled = createApp(parseConfig(env({ GATEWAY_ADMIN_KEY: '' }))); assert.equal((await disabled(new Request('http://localhost/admin/metrics'))).status, 404);
});

test('OpenAI real adapter shape, no upstream secrets leaked, cache off by default and correct cost estimate', async () => {
  let outbound;
  const app = createApp(parseConfig(env()), { fetchImpl: async (url, options) => { outbound = { url, options }; return providerResponse(); } });
  const response = await app(req()); assert.equal(response.status, 200); assert.equal(response.headers.get('x-ti-cache'), 'BYPASS');
  assert.equal(response.headers.get('x-ti-provider-cost-estimate-usd'), '0.00000360');
  assert.equal(response.headers.get('x-ti-cost-source'), 'configured_rate_card_estimate');
  const data = await response.json(); assert.equal(data.model, 'economy'); assert.equal(data.usage.total_tokens, 15);
  assert.equal(outbound.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(outbound.options.headers.authorization, 'Bearer provider-openai-secret');
  const sent = JSON.parse(outbound.options.body); assert.equal(sent.model, 'gpt-4o-mini'); assert.equal(sent.stream, false); assert.deepEqual(sent.messages, payload().messages);
  assert.equal(JSON.stringify(data).includes('provider-openai-secret'), false);
});

test('Anthropic request preserves system at top and normalizes text/usage into OpenAI-compatible response', async () => {
  let sent, auth;
  const app = createApp(parseConfig(env()), { fetchImpl: async (url, options) => { assert.equal(url, 'https://api.anthropic.com/v1/messages'); sent = JSON.parse(options.body); auth = options.headers['x-api-key']; return anthropicResponse(); } });
  const response = await app(req('/v1/chat/completions', { body: payload('prose') })); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.choices[0].message.content, 'Hi.'); assert.equal(data.usage.total_tokens, 10);
  assert.equal(sent.system, 'Be brief'); assert.deepEqual(sent.messages, [{ role: 'user', content: 'hi' }]); assert.equal(sent.model, 'claude-example'); assert.equal(auth, 'provider-anthropic-secret');
});

test('exact opt-in cache isolated by tenant, prompt, alias and TTL; hit reports zero newly billed provider tokens', async () => {
  let now = 1000, calls = 0;
  const app = createApp(parseConfig(env({ GATEWAY_CACHE_TTL_SECONDS: '2' })), { clock: () => now, fetchImpl: async () => { calls++; return providerResponse(); } });
  const first = await app(req('/v1/chat/completions', { mode: 'exact' })); assert.equal(first.headers.get('x-ti-cache'), 'MISS');
  const second = await app(req('/v1/chat/completions', { mode: 'exact' })); assert.equal(second.headers.get('x-ti-cache'), 'HIT');
  assert.equal(second.headers.get('x-ti-usage-source'), 'gateway_replay'); assert.equal((await second.json()).usage.total_tokens, 0); assert.equal(calls, 1);
  await app(req('/v1/chat/completions', { tenant: TENANT_B, mode: 'exact' })); assert.equal(calls, 2);
  await app(req('/v1/chat/completions', { mode: 'exact', body: payload('economy', 'different') })); assert.equal(calls, 3);
  now = 3001; const expired = await app(req('/v1/chat/completions', { mode: 'exact' })); assert.equal(expired.headers.get('x-ti-cache'), 'MISS'); assert.equal(calls, 4);
});

test('does not cache stochastic, incomplete or missing-usage response and rejects unsupported requests', async () => {
  let calls = 0;
  const app = createApp(parseConfig(env()), { fetchImpl: async () => { calls++; return Response.json({ choices: [{ message: { content: 'truncated' }, finish_reason: 'length' }], usage: { prompt_tokens: 3, completion_tokens: 4 } }); } });
  assert.equal((await app(req('/v1/chat/completions', { mode: 'exact', body: { ...payload(), temperature: 1 } }))).status, 422);
  assert.equal((await app(req('/v1/chat/completions', { mode: 'exact', body: { ...payload(), stream: true } }))).status, 422);
  assert.equal((await app(req('/v1/chat/completions', { body: { ...payload(), tools: [] } }))).status, 422);
  assert.equal((await app(req('/v1/chat/completions', { body: { ...payload(), max_tokens: 999999 } }))).status, 422);
  assert.equal((await app(req('/v1/chat/completions', { body: payload('unapproved') }))).status, 404);
  assert.equal((await app(req('/v1/chat/completions', { mode: 'exact' }))).headers.get('x-ti-cache'), 'MISS');
  assert.equal((await app(req('/v1/chat/completions', { mode: 'exact' }))).headers.get('x-ti-cache'), 'MISS'); assert.equal(calls, 2);
});

test('provider failures and malformed responses are sanitized and never cached', async () => {
  for (const [providerResult, code] of [[Response.json({ error: { message: 'SECRET FROM UPSTREAM' } }, { status: 429 }), 'UPSTREAM_RATE_LIMITED'], [new Response('private error', { status: 500 }), 'UPSTREAM_ERROR'], [new Response('not-json'), 'UPSTREAM_INVALID_RESPONSE'], [Response.json({ choices: [{ message: { content: 'x' }, finish_reason: 'other' }] }), 'UPSTREAM_UNSUPPORTED_RESPONSE']]) {
    let n = 0;
    const app = createApp(parseConfig(env()), { fetchImpl: async () => { n++; return providerResult.clone(); } });
    for (let i = 0; i < 2; i++) { const response = await app(req('/v1/chat/completions', { mode: 'exact' })); assert.notEqual(response.status, 200); const text = await response.text(); assert.match(text, new RegExp(code)); assert.doesNotMatch(text, /SECRET FROM UPSTREAM|private error/); }
    assert.equal(n, 2);
  }
});

test('per-tenant process rate limit and cache LRU eviction are bounded', async () => {
  const app = createApp(parseConfig(env({ GATEWAY_RPM_PER_TENANT: '1' })), { fetchImpl: async () => providerResponse() });
  assert.equal((await app(req('/v1/models', { method: 'GET' }))).status, 200);
  assert.equal((await app(req('/v1/chat/completions'))).status, 429);
  assert.equal((await app(req('/v1/chat/completions', { tenant: TENANT_B }))).status, 200);
  let now = 1000; const cache = new ExactCache(1, 1, () => now);
  cache.put('a', { value: 1 }); cache.put('b', { value: 2 }); assert.equal(cache.get('a'), null); assert.deepEqual(cache.get('b'), { value: 2 }); now = 2000; assert.equal(cache.get('b'), null);
  assert.notEqual(requestKey('alpha', { provider: 'openai', model: 'm' }, payload()), requestKey('beta', { provider: 'openai', model: 'm' }, payload()));
});

test('body cap enforced using actual UTF-8 bytes, not only Content-Length, and invalid credentials rejected', async () => {
  let calls = 0; const app = createApp(parseConfig(env()), { fetchImpl: async () => { calls++; return providerResponse(); } });
  const large = payload('economy', 'é'.repeat(20000));
  const oversize = await app(req('/v1/chat/completions', { body: large, headers: { 'content-length': '2' } })); assert.equal(oversize.status, 413);
  assert.equal((await app(req('/v1/chat/completions', { tenant: 'invalid' }))).status, 401);
  assert.equal(calls, 0);
});

test('unknown prototype property cannot act as a route alias', async () => {
  const app = createApp(parseConfig(env()), { fetchImpl: async () => { throw new Error('should never happen'); } });
  assert.equal((await app(req('/v1/chat/completions', { body: payload('toString') }))).status, 404);
});
