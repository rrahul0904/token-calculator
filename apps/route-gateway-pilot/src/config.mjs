const TOKEN_PATTERN = /^[A-Za-z0-9_\-]{4,64}$/;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:\-]{0,127}$/;
const SUPPORTED = new Set(['openai', 'anthropic']);

export function parseConfig(env = process.env) {
  let tenants, routes;
  try {
    tenants = JSON.parse(env.GATEWAY_TENANTS_JSON ?? '{}');
    routes = JSON.parse(env.GATEWAY_ROUTES_JSON ?? '{}');
  } catch { throw new Error('INVALID_GATEWAY_JSON_CONFIG'); }
  if (!tenants || typeof tenants !== 'object' || Array.isArray(tenants) || !Object.keys(tenants).length) throw new Error('GATEWAY_TENANTS_REQUIRED');
  if (!routes || typeof routes !== 'object' || Array.isArray(routes) || !Object.keys(routes).length) throw new Error('GATEWAY_ROUTES_REQUIRED');
  const tokens = [];
  const seenSecrets = new Set();
  for (const [tenant, secret] of Object.entries(tenants)) {
    if (!TOKEN_PATTERN.test(tenant) || typeof secret !== 'string' || secret.length < 32 || /\s/.test(secret)) throw new Error('INVALID_TENANT_CREDENTIAL_CONFIG');
    if (seenSecrets.has(secret)) throw new Error('TENANT_CREDENTIAL_REUSED');
    seenSecrets.add(secret);
    tokens.push({ tenant, secret });
  }
  const models = Object.create(null);
  for (const [alias, value] of Object.entries(routes)) {
    if (!TOKEN_PATTERN.test(alias) || !value || typeof value !== 'object' || Array.isArray(value) || !SUPPORTED.has(value.provider) || typeof value.model !== 'string' || !MODEL_PATTERN.test(value.model)) throw new Error('INVALID_GATEWAY_ROUTE_CONFIG');
    const inputRate = value.inputPerMillionUsd;
    const outputRate = value.outputPerMillionUsd;
    if (![inputRate, outputRate].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100000)) throw new Error('INVALID_GATEWAY_RATE_CARD');
    models[alias] = Object.freeze({ provider: value.provider, model: value.model, inputPerMillionUsd: inputRate, outputPerMillionUsd: outputRate });
  }
  for (const provider of new Set(Object.values(models).map(v => v.provider))) {
    if (!(provider === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY)) throw new Error(`MISSING_${provider.toUpperCase()}_API_KEY`);
  }
  if (env.GATEWAY_ADMIN_KEY && seenSecrets.has(env.GATEWAY_ADMIN_KEY)) throw new Error('ADMIN_CREDENTIAL_REUSED');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
  const ttl = Number(env.GATEWAY_CACHE_TTL_SECONDS ?? 120);
  if (!Number.isInteger(ttl) || ttl < 0 || ttl > 300) throw new Error('INVALID_CACHE_TTL');
  const maxEntries = Number(env.GATEWAY_CACHE_MAX_ENTRIES ?? 256);
  if (!Number.isInteger(maxEntries) || maxEntries < 0 || maxEntries > 1000) throw new Error('INVALID_CACHE_SIZE');
  const rpm = Number(env.GATEWAY_RPM_PER_TENANT ?? 60);
  if (!Number.isInteger(rpm) || rpm < 1 || rpm > 1000) throw new Error('INVALID_RPM');
  return Object.freeze({ tenants: tokens, routes: Object.freeze(models), port, ttl, maxEntries, rpm,
    openaiKey: env.OPENAI_API_KEY ?? '', anthropicKey: env.ANTHROPIC_API_KEY ?? '',
    adminKey: typeof env.GATEWAY_ADMIN_KEY === 'string' && env.GATEWAY_ADMIN_KEY.length >= 32 ? env.GATEWAY_ADMIN_KEY : null });
}
