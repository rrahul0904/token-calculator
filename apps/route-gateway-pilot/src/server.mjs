import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { parseConfig } from './config.mjs';
import { createApp } from './core.mjs';

const config = parseConfig(); // Fail closed before binding port if credentials/routes missing.
const handler = createApp(config);
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${config.port}`);
  const abort = new AbortController();
  req.on('aborted', () => abort.abort());
  try {
    const body = ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : Readable.toWeb(req);
    const request = new Request(url, { method: req.method, headers: req.headers, body, ...(body ? { duplex: 'half' } : {}), signal: abort.signal });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch {
    if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end('{"error":{"code":"INTERNAL_ERROR"}}'); }
    else res.end();
  }
});
server.listen(config.port, '0.0.0.0', () => console.log(`Route Gateway Pilot listening on port ${config.port}; single-instance ephemeral mode.`));
