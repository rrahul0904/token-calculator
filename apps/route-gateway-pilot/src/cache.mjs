import { createHash, timingSafeEqual } from 'node:crypto';

export function authenticate(header, tenants) {
  if (typeof header !== 'string' || !/^Bearer [^\s]+$/.test(header) || header.length > 512) return null;
  const supplied = createHash('sha256').update(header.slice(7)).digest();
  let matched = null;
  // Compare all configured credentials to reduce identifier-oracle differences.
  for (const entry of tenants) {
    const digest = createHash('sha256').update(entry.secret).digest();
    if (timingSafeEqual(supplied, digest)) matched = entry.tenant;
  }
  return matched;
}

export function requestKey(tenant, route, request) {
  return createHash('sha256').update(JSON.stringify({ version: 1, tenant, provider: route.provider,
    model: route.model, request: { messages: request.messages, temperature: request.temperature, max_tokens: request.max_tokens } })).digest('hex');
}

export class ExactCache {
  constructor(ttlSeconds, maxEntries, clock = () => Date.now()) {
    this.ttlMs = ttlSeconds * 1000; this.limit = maxEntries; this.clock = clock; this.values = new Map();
  }
  get(key) {
    const hit = this.values.get(key);
    if (!hit) return null;
    if (hit.expires <= this.clock()) { this.values.delete(key); return null; }
    this.values.delete(key); this.values.set(key, hit);
    return structuredClone(hit.response);
  }
  put(key, response) {
    if (!this.ttlMs || !this.limit) return;
    this.values.delete(key);
    this.values.set(key, { expires: this.clock() + this.ttlMs, response: structuredClone(response) });
    for (const [id, value] of this.values) if (value.expires <= this.clock()) this.values.delete(id);
    while (this.values.size > this.limit) this.values.delete(this.values.keys().next().value);
  }
}
