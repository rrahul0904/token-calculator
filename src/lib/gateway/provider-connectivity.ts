export type GatewayProviderName = "openai" | "anthropic" | "gemini";

export interface ProviderVerificationResult {
  ok: boolean;
  provider: GatewayProviderName;
  status: number | null;
  detail: string;
}

function timeoutSignal(ms = 8_000): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function verifyOpenAI(credential: string): Promise<ProviderVerificationResult> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${credential}` },
      signal: timeoutSignal(),
      cache: "no-store",
    });
    return {
      ok: response.ok,
      provider: "openai",
      status: response.status,
      detail: response.ok ? "Credential accepted by OpenAI Models API." : `OpenAI returned HTTP ${response.status}.`,
    };
  } catch {
    return { ok: false, provider: "openai", status: null, detail: "OpenAI credential verification request failed." };
  }
}

async function verifyAnthropic(credential: string): Promise<ProviderVerificationResult> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      method: "GET",
      headers: {
        "x-api-key": credential,
        "anthropic-version": "2023-06-01",
      },
      signal: timeoutSignal(),
      cache: "no-store",
    });
    return {
      ok: response.ok,
      provider: "anthropic",
      status: response.status,
      detail: response.ok ? "Credential accepted by Claude Models API." : `Claude API returned HTTP ${response.status}.`,
    };
  } catch {
    return { ok: false, provider: "anthropic", status: null, detail: "Claude credential verification request failed." };
  }
}

async function verifyGemini(credential: string): Promise<ProviderVerificationResult> {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      method: "GET",
      headers: { "x-goog-api-key": credential },
      signal: timeoutSignal(),
      cache: "no-store",
    });
    return {
      ok: response.ok,
      provider: "gemini",
      status: response.status,
      detail: response.ok ? "Credential accepted by Gemini Models API." : `Gemini API returned HTTP ${response.status}.`,
    };
  } catch {
    return { ok: false, provider: "gemini", status: null, detail: "Gemini credential verification request failed." };
  }
}

export async function verifyProviderCredential(provider: GatewayProviderName, credential: string): Promise<ProviderVerificationResult> {
  if (provider === "openai") return verifyOpenAI(credential);
  if (provider === "anthropic") return verifyAnthropic(credential);
  return verifyGemini(credential);
}
