# PulseAtlas instrumentation

Token Intelligence sends only content-blind portfolio telemetry. The browser tracker currently emits `page_view` with a strict static-path allowlist: customer-controlled project and run identifiers are replaced with route templates, and unknown paths are recorded only as `/other`. It never includes calculator text, prompts, token pieces, API keys, provider credentials, BYOK secrets, query strings, or fragments.

Telemetry is optional and fail-open. Missing configuration or a PulseAtlas outage must never affect calculator or control-plane functionality.

Required deployment variables when enabled:

- `NEXT_PUBLIC_PULSEATLAS_ENDPOINT`
- `NEXT_PUBLIC_PULSEATLAS_WRITE_KEY`
- `NEXT_PUBLIC_PULSEATLAS_ENVIRONMENT`

Future `calculation_completed` telemetry must use only the PulseAtlas allowlist: provider, model, feature, token-count bucket, context-utilization bucket, and estimated-cost bucket. Raw prompt text is prohibited.
