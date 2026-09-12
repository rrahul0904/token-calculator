import process from "node:process";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string, fallback?: string) {
  const value = argument(name) ?? fallback;
  if (!value?.trim()) throw new Error(`MISSING_VERCEL_INPUT:${name}`);
  return value.trim();
}

const token = required("token", process.env.VERCEL_TOKEN);
const teamId = required("team-id", process.env.VERCEL_ORG_ID);
const inputUrl = required("url");
const hostname = new URL(inputUrl.includes("://") ? inputUrl : `https://${inputUrl}`).hostname;
const response = await fetch(
  `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}?teamId=${encodeURIComponent(teamId)}`,
  {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  },
);
if (!response.ok) throw new Error(`VERCEL_DEPLOYMENT_LOOKUP_HTTP_${response.status}`);
const deployment = await response.json() as {
  id?: string;
  url?: string;
  readyState?: string;
  target?: string | null;
};
if (!deployment.id || !deployment.url) throw new Error("VERCEL_DEPLOYMENT_LOOKUP_INCOMPLETE");

const result = {
  id: deployment.id,
  url: `https://${deployment.url}`,
  readyState: deployment.readyState ?? null,
  target: deployment.target ?? null,
};

const expectedId = argument("expect-id");
if (expectedId && result.id !== expectedId) {
  throw new Error(`VERCEL_DEPLOYMENT_ID_MISMATCH:expected=${expectedId}:actual=${result.id}`);
}

process.stdout.write(JSON.stringify(result) + "\n");
