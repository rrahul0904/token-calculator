# @token-intelligence/sdk

TypeScript source SDK for Token Intelligence.

Package name: `@token-intelligence/sdk`

The public economics methods do not require an API key:

```ts
import { TokenIntelligenceClient } from "@token-intelligence/sdk";

const ti = new TokenIntelligenceClient({});
await ti.tokenize({ text: "hello world" });
await ti.models.list();
await ti.models.get("gpt-5.6-sol");
await ti.models.pricingHistory("gemini-3.7-flash");
await ti.estimate({ inputTokens: 12000, outputTokens: 1200 });
```

Provide `apiKey` for authenticated tenant/run/control/gateway methods.

This repository does not claim that the package has been published to a registry until the release pipeline does so.
