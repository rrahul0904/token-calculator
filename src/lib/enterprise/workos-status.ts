type WorkOsConnection = { id: string; organization_id?: string; connection_type?: string; name?: string; state?: string; domains?: Array<{ domain?: string }> };
type WorkOsDirectory = { id: string; organization_id?: string; type?: string; state?: string; name?: string; domain?: string; metadata?: unknown };

type WorkOsList<T> = { data?: T[] };

async function workosGet<T>(path: string): Promise<T> {
  const key = process.env.WORKOS_API_KEY;
  if (!key) throw new Error("WORKOS_API_KEY_NOT_CONFIGURED");
  const response = await fetch(`https://api.workos.com${path}`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`WORKOS_API_${response.status}`);
  return response.json() as Promise<T>;
}

export interface EnterpriseIdentityStatus {
  configured: boolean;
  workosOrganizationId: string | null;
  sso: Array<{ id: string; name: string; type: string; state: string; domains: string[] }>;
  directories: Array<{ id: string; name: string; type: string; state: string; domain: string | null }>;
  error?: string;
}

export async function getEnterpriseIdentityStatus(workosOrganizationId: string | null): Promise<EnterpriseIdentityStatus> {
  if (!process.env.WORKOS_API_KEY || !workosOrganizationId) return { configured: false, workosOrganizationId, sso: [], directories: [] };
  const encoded = encodeURIComponent(workosOrganizationId);
  try {
    const [connections, directories] = await Promise.all([
      workosGet<WorkOsList<WorkOsConnection>>(`/connections?organization_id=${encoded}&limit=100`),
      workosGet<WorkOsList<WorkOsDirectory>>(`/directories?organization_id=${encoded}&limit=100`),
    ]);
    return {
      configured: true,
      workosOrganizationId,
      sso: (connections.data ?? []).map((connection) => ({ id: connection.id, name: connection.name ?? "SSO connection", type: connection.connection_type ?? "unknown", state: connection.state ?? "unknown", domains: (connection.domains ?? []).flatMap((domain) => domain.domain ? [domain.domain] : []) })),
      directories: (directories.data ?? []).map((directory) => ({ id: directory.id, name: directory.name ?? "Directory", type: directory.type ?? "unknown", state: directory.state ?? "unknown", domain: directory.domain ?? null })),
    };
  } catch (error) {
    return { configured: true, workosOrganizationId, sso: [], directories: [], error: error instanceof Error ? error.message : "WORKOS_STATUS_FAILED" };
  }
}
