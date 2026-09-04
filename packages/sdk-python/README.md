# token-intelligence

Python source SDK for Token Intelligence.

Package name: `token-intelligence`

Public economics methods work without an API key:

```python
from token_intelligence import TokenIntelligenceClient

ti = TokenIntelligenceClient()
ti.tokenize("hello world")
ti.models()
ti.model("gpt-5.6-sol")
ti.pricing_history("gemini-3.7-flash")
ti.estimate(inputTokens=12000, outputTokens=1200)
```

Pass `api_key=` for authenticated tenant/run/control/gateway methods.

This repository does not claim that the package has been published to a registry until the release pipeline does so.
