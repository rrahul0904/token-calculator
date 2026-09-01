import { AppPageHeader } from "@/components/app-ui";
import { ApiKeyManager } from "@/components/api-key-manager";
import { getTenantContext } from "@/lib/auth/session";
import "./api-keys.css";

export default async function ApiKeysPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  return <><AppPageHeader kicker="Developer access" title="API Keys" description="Create scoped first-party credentials for SDKs, collectors, CI and MCP. Full secrets are displayed only at creation." /><ApiKeyManager /></>;
}
