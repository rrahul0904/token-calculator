import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ExactCache, authenticate, requestKey } from './cache.mjs';

const MAX_BYTES = 32768;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const KNOWN_FIELDS = new Set(['model', 'messages', 'temperature', 'max_tokens', 'stream']);
const HELP = 'Send Authorization: Bearer <tenant key>. Set x-ti-cache: exact only for an explicitly approved deterministic replay workload.';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function json(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } }); }
function fail(code, status = 400) { return json({ error: { type: 'gateway_error', code, message: code } }, status); }
async function bodyWithinLimit(request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > MAX_BYTES) { await reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some(k => !KNOWN_FIELDS.has(k))) return null;
  if (typeof value.model !== 'string' || !value.model || !Array.isArray(value.messages) || !value.messages.length || value.messages.length > 64) return null;
  if (value.stream !== undefined && value.stream !== false) return null;
  if (value.temperature !== undefined && (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2)) return null;
  if (value.max_tokens !== undefined && (!Number.isInteger(value.max_tokens) || value.max_tokens < 1 || value.max_tokens > 8192)) return null;
  let nonSystemSeen = false;
  for (const message of value.messages) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).sort().join(',') !== 'content,role') return null;
    if (!['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.length || message.content.length > 24000) return null;
    if (message.role === 'system' && nonSystemSeen) return null;
    if (message.role !== 'system') nonSystemSeen = true;
  }
  if (!nonSystemSeen) return null;
  return { model: value.model, messages: value.messages, temperature: value.temperature ?? 1, max_tokens: value.max_tokens ?? 1024 };
}
function headersFor(cacheStatus, cost = null, source = 'unknown', providerMode = 'configured_provider') {
  return { 'x-ti-cache': cacheStatus, 'x-ti-usage-source': source, 'x-ti-provider-mode': providerMode, 'x-ti-cost-source': cost === null ? 'unavailable' : 'configured_rate_card_estimate',
    ...(cost !== null ? { 'x-ti-provider-cost-estimate-usd': cost.toFixed(8) } : {}) };
}
function usageFromOpenAI(value) {
  const usage = value?.usage;
  if (!usage || !Number.isInteger(usage.prompt_tokens) || usage.prompt_tokens < 0 || !Number.isInteger(usage.completion_tokens) || usage.completion_tokens < 0) return null;
  return { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.prompt_tokens + usage.completion_tokens };
}
function usageFromAnthropic(value) {
  const usage = value?.usage;
  if (!usage || !Number.isInteger(usage.input_tokens) || usage.input_tokens < 0 || !Number.isInteger(usage.output_tokens) || usage.output_tokens < 0) return null;
  const cacheRead = Number.isInteger(usage.cache_read_input_tokens) && usage.cache_read_input_tokens >= 0 ? usage.cache_read_input_tokens : 0;
  const cacheWrite = Number.isInteger(usage.cache_creation_input_tokens) && usage.cache_creation_input_tokens >= 0 ? usage.cache_creation_input_tokens : 0;
  return { prompt_tokens: usage.input_tokens + cacheRead + cacheWrite, completion_tokens: usage.output_tokens, total_tokens: usage.input_tokens + cacheRead + cacheWrite + usage.output_tokens };
}
function normalizeProvider(provider, value, alias) {
  if (provider === 'openai') {
    if (!value || !Array.isArray(value.choices) || value.choices.length !== 1 || typeof value.choices[0]?.message?.content !== 'string' || !['stop', 'length'].includes(value.choices[0]?.finish_reason)) return null;
    return { id: typeof value.id === 'string' ? value.id : `chatcmpl-${randomUUID()}`, object: 'chat.completion', created: Number.isInteger(value.created) ? value.created : Math.floor(Date.now() / 1000), model: alias,
      choices: [{ index: 0, message: { role: 'assistant', content: value.choices[0].message.content }, finish_reason: value.choices[0].finish_reason }],
      usage: usageFromOpenAI(value), _cacheable: value.choices[0].finish_reason === 'stop' };
  }
  if (!value || !Array.isArray(value.content) || value.content.length !== 1 || value.content[0]?.type !== 'text' || typeof value.content[0]?.text !== 'string' || !['end_turn', 'max_tokens'].includes(value.stop_reason)) return null;
  return { id: `chatcmpl-${randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: alias,
    choices: [{ index: 0, message: { role: 'assistant', content: value.content[0].text }, finish_reason: value.stop_reason === 'end_turn' ? 'stop' : 'length' }],
    usage: usageFromAnthropic(value), _cacheable: value.stop_reason === 'end_turn' };
}
function toProvider(route, body, config) {
  if (route.provider === 'openai') return { url: OPENAI_URL, init: { method: 'POST', headers: { authorization: `Bearer ${config.openaiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: route.model, messages: body.messages, temperature: body.temperature, max_tokens: body.max_tokens, stream: false }) } };
  const system = body.messages.filter(x => x.role === 'system').map(x => x.content).join('\n\n');
  return { url: ANTHROPIC_URL, init: { method: 'POST', headers: { 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: route.model, ...(system ? { system } : {}), messages: body.messages.filter(x => x.role !== 'system'), max_tokens: body.max_tokens, temperature: body.temperature, stream: false }) } };
}
export function createApp(config, { fetchImpl = fetch, clock = () => Date.now(), previewMode = false } = {}) {
  const providerMode = previewMode ? 'synthetic_fixture' : 'configured_provider';
  const cache = new ExactCache(config.ttl, config.maxEntries, clock);
  const limits = new Map();
  const metrics = { accepted: 0, rejected: 0, upstreamCalls: 0, upstreamErrors: 0, cacheHits: 0, cacheMisses: 0, estimatedUpstreamCostUsd: 0, unknownUsageCalls: 0 };
  function authorize(request) { return authenticate(request.headers.get('authorization'), config.tenants); }
  function limit(tenant) {
    const window = Math.floor(clock() / 60000);
    const entry = limits.get(tenant);
    if (!entry || entry.window !== window) { limits.set(tenant, { window, count: 1 }); return true; }
    if (entry.count >= config.rpm) return false;
    entry.count++; return true;
  }
  return async function handle(request) {
    const pathname = new URL(request.url).pathname;
    if (request.method === 'GET' && pathname === '/healthz') return json({ status: 'ok', service: 'route-gateway-pilot', mode: 'single_instance', storage: 'ephemeral', provider_mode: providerMode });
    if (request.method === 'GET' && pathname === '/') {
      const html = await readFile(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
    }
    if (pathname === '/admin/metrics' && request.method === 'GET') {
      if (!config.adminKey) return fail('ADMIN_ENDPOINT_DISABLED', 404);
      const result = authenticate(request.headers.get('authorization'), [{ tenant: 'admin', secret: config.adminKey }]);
      return result ? json({ ...metrics, scope: 'process_only', providerMode, costSource: previewMode ? 'synthetic_fixture_no_spend' : 'configured_rate_card_estimate' }) : fail('UNAUTHORIZED', 401);
    }
    const tenant = authorize(request);
    if (!tenant) { metrics.rejected++; return fail('UNAUTHORIZED', 401); }
    if (!limit(tenant)) { metrics.rejected++; return fail('RATE_LIMIT_EXCEEDED', 429); }
    if (request.method === 'GET' && pathname === '/v1/models') return json({ object: 'list', data: Object.entries(config.routes).map(([id, route]) => ({ id, object: 'model', owned_by: route.provider })) });
    if (pathname !== '/v1/chat/completions' || request.method !== 'POST') return fail('NOT_FOUND', 404);
    const length = Number(request.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BYTES) { metrics.rejected++; return fail('REQUEST_TOO_LARGE', 413); }
    const raw = await bodyWithinLimit(request).catch(() => null);
    if (raw === null) { metrics.rejected++; return fail('REQUEST_TOO_LARGE', 413); }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { metrics.rejected++; return fail('INVALID_JSON'); }
    const body = validate(parsed);
    if (!body) { metrics.rejected++; return fail('UNSUPPORTED_REQUEST_SHAPE', 422); }
    const route = config.routes[body.model];
    if (!route) { metrics.rejected++; return fail('UNKNOWN_MODEL_ALIAS', 404); }
    const mode = request.headers.get('x-ti-cache');
    if (mode !== null && mode !== 'exact') { metrics.rejected++; return fail('INVALID_CACHE_MODE', 422); }
    if (mode === 'exact' && (body.temperature !== 0 || !config.ttl || !config.maxEntries)) { metrics.rejected++; return fail('EXACT_CACHE_NOT_ELIGIBLE', 422); }
    metrics.accepted++;
    const key = mode === 'exact' ? requestKey(tenant, route, body) : null;
    if (key) {
      const cached = cache.get(key);
      if (cached) {
        metrics.cacheHits++;
        cached.id = `chatcmpl-cache-${randomUUID()}`;
        cached.created = Math.floor(clock() / 1000);
        cached.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        return json(cached, 200, headersFor('HIT', previewMode ? null : 0, 'gateway_replay', providerMode));
      }
      metrics.cacheMisses++;
    }
    const upstream = toProvider(route, body, config);
    metrics.upstreamCalls++;
    let response;
    try { response = await fetchImpl(upstream.url, { ...upstream.init, signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]), cache: 'no-store' }); }
    catch { metrics.upstreamErrors++; return fail('UPSTREAM_UNAVAILABLE', 502); }
    if (!response.ok) { metrics.upstreamErrors++; return fail(response.status === 429 ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_ERROR', response.status === 429 ? 503 : 502); }
    let providerBody;
    try { providerBody = await response.json(); }
    catch { metrics.upstreamErrors++; return fail('UPSTREAM_INVALID_RESPONSE', 502); }
    const result = normalizeProvider(route.provider, providerBody, body.model);
    if (!result) { metrics.upstreamErrors++; return fail('UPSTREAM_UNSUPPORTED_RESPONSE', 502); }
    const { _cacheable, ...replyBody } = result;
    const usage = result.usage;
    const cost = !previewMode && usage ? (usage.prompt_tokens * route.inputPerMillionUsd + usage.completion_tokens * route.outputPerMillionUsd) / 1_000_000 : null;
    if (!previewMode) {
      if (cost === null) metrics.unknownUsageCalls++; else metrics.estimatedUpstreamCostUsd += cost;
    }
    if (key && _cacheable && usage) cache.put(key, replyBody);
    return json(replyBody, 200, headersFor(key ? 'MISS' : 'BYPASS', cost, previewMode ? 'synthetic_fixture' : (usage ? 'provider_reported' : 'unavailable'), providerMode));
  };
}
export { HELP };
