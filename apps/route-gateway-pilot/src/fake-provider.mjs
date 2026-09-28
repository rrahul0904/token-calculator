import { createHash } from 'node:crypto';

// A bounded, network-free transport for certification only. This is not an LLM.
export async function syntheticProviderFetch(url, init) {
  if (url !== 'https://api.openai.com/v1/chat/completions' || init?.method !== 'POST') {
    throw new Error('SYNTHETIC_PROVIDER_ROUTE_MISMATCH');
  }
  const outbound = JSON.parse(init.body);
  if (outbound.model !== 'synthetic-fixture' || outbound.stream !== false ||
      !Array.isArray(outbound.messages)) throw new Error('SYNTHETIC_PROVIDER_REQUEST_MISMATCH');
  const digest = createHash('sha256').update(JSON.stringify({
    messages: outbound.messages, temperature: outbound.temperature, max_tokens: outbound.max_tokens
  })).digest('hex').slice(0, 16);
  return Response.json({
    id: 'synthetic-' + digest, object: 'chat.completion', created: 1,
    choices: [{ index: 0, message: { role: 'assistant',
      content: 'SYNTHETIC FIXTURE ONLY: deterministic reply ' + digest },
      finish_reason: 'stop' }],
    usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 }
  });
}
