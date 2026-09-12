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
const projectId = required("project-id", process.env.VERCEL_PROJECT_ID);
const limit = Math.min(Math.max(Number(argument("limit") ?? 10), 1), 50);

const url = new URL("https://api.vercel.com/v7/deployments");
url.searchParams.set("projectId", projectId);
url.searchParams.set("teamId", teamId);
url.searchParams.set("target", "production");
url.searchParams.set("state", "READY");
url.searchParams.set("limit", String(limit));

const response = await fetch(url, {
  headers: { authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`VERCEL_DEPLOYMENT_LIST_HTTP_${response.status}`);
const body = await response.json() as {
  deployments?: Array<{
    uid?: string;
    id?: string;
    url?: string | null;
    state?: string;
    readyState?: string;
    created?: number;
    createdAt?: number;
    meta?: Record<string, unknown>;
  }>;
};

const deployments = (body.deployments ?? []).map((deployment) => ({
  id: deployment.uid ?? deployment.id ?? null,
  url: deployment.url ? `https://${deployment.url}` : null,
  state: deployment.readyState ?? deployment.state ?? null,
  createdAt: deployment.createdAt ?? deployment.created ?? null,
  gitSha: typeof deployment.meta?.githubCommitSha === "string"
    ? deployment.meta.githubCommitSha
    : typeof deployment.meta?.gitlabCommitSha === "string"
      ? deployment.meta.gitlabCommitSha
      : null,
}));

process.stdout.write(JSON.stringify({ projectId, target: "production", deployments }, null, 2) + "\n");
