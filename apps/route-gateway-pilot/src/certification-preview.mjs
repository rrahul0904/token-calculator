import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfig } from './config.mjs';
import { createApp } from './core.mjs';
import { syntheticProviderFetch } from './fake-provider.mjs';

// Explicitly separate from the normal server: the preview can never invoke a paid provider.
export function createPreviewServer(env = process.env) {
  if (env.GATEWAY_CERTIFICATION_PREVIEW !== 'FAKE_ONLY') {
    throw new Error('CERTIFICATION_PREVIEW_EXPLICIT_OPT_IN_REQUIRED');
  }
  if (env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY) {
    throw new Error('REAL_PROVIDER_KEYS_FORBIDDEN_IN_SYNTHETIC_PREVIEW');
  }
  const config = parseConfig({
    ...env,
    OPENAI_API_KEY: 'synthetic-transport-only-never-sent',
    GATEWAY_ROUTES_JSON: JSON.stringify({
      fixture: { provider: 'openai', model: 'synthetic-fixture',
        inputPerMillionUsd: 0, outputPerMillionUsd: 0 }
    })
  });
  const handler = createApp(config, { fetchImpl: syntheticProviderFetch, previewMode: true });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${config.port}`);
    const abort = new AbortController();
    req.on('aborted', () => abort.abort());
    try {
      const body = ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : Readable.toWeb(req);
      const request = new Request(url, { method: req.method, headers: req.headers, body,
        ...(body ? { duplex: 'half' } : {}), signal: abort.signal });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end('{"error":{"code":"INTERNAL_ERROR"}}');
      } else res.end();
    }
  });
  return { server, config };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, config } = createPreviewServer();
  server.listen(config.port, '0.0.0.0', () => {
    console.log('SYNTHETIC-ONLY gateway certification preview listening; zero provider network calls.');
  });
}
