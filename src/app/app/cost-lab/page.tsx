import { AppPageHeader } from "@/components/app-ui";
import { CostLabWorkspace } from "@/components/cost-lab-workspace";
import { getTenantContext } from "@/lib/auth/session";

export default async function AppCostLabPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  return <><AppPageHeader kicker="Pre-flight economics" title="Cost Lab" description="Compare prompt variants and workload assumptions locally, then save only economics metadata when you want a durable scenario." /><CostLabWorkspace /></>;
}
