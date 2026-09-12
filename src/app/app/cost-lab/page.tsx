import { AppPageHeader } from "@/components/app-ui";
import { CostLabWorkspace } from "@/components/cost-lab-workspace";
import { ImportedWorkloadPanel } from "@/components/imported-workload-panel";
import { getTenantContext } from "@/lib/auth/session";
import "./cost-lab.css";

export default async function AppCostLabPage() {
  const tenant = await getTenantContext();
  if (!tenant) return null;
  return <><AppPageHeader kicker="Pre-flight economics" title="Cost Lab" description="Compare prompt variants locally or import a shareable workload plan; durable saves retain economics metadata rather than prompt content." /><div className="app-stack"><ImportedWorkloadPanel /><CostLabWorkspace /></div></>;
}
