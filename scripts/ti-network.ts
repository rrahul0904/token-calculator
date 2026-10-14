const DEFAULT_BASE_URL = "https://token-intelligence-eight.vercel.app";

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function resolveCliBaseUrl(value: string, allowCustomOrigin: boolean) {
  let url: URL;
  try {
    url = new URL(value || DEFAULT_BASE_URL);
  } catch {
    throw new Error("TOKEN_INTELLIGENCE_BASE_URL_INVALID");
  }
  const localHttp = url.protocol === "http:" && isLoopback(url.hostname);
  if ((!localHttp && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("TOKEN_INTELLIGENCE_BASE_URL_INVALID");
  }
  if (url.origin !== DEFAULT_BASE_URL && !allowCustomOrigin) {
    throw new Error("CUSTOM_BASE_URL_REQUIRES_--allow-custom-origin");
  }
  return url.origin;
}
