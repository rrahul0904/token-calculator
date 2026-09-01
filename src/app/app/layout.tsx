import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { WorkspaceConfigurationGate, WorkspaceOnboarding } from "@/components/workspace-gates";
import { getConfigurationStatus } from "@/lib/config";
import { getExternalAuthSession, getTenantContext } from "@/lib/auth/session";
import "./app.css";

export default async function ApplicationLayout({ children }: { children: ReactNode }) {
  const configuration = getConfigurationStatus();
  if (configuration.auth !== "live" || configuration.database !== "live") {
    return <WorkspaceConfigurationGate database={configuration.database} auth={configuration.auth} />;
  }

  const external = await getExternalAuthSession();
  if (!external) redirect("/sign-in");

  const tenant = await getTenantContext();
  if (!tenant) return <WorkspaceOnboarding />;

  return (
    <AppShell
      organizationName={tenant.organizationName}
      userName={tenant.name ?? tenant.email}
      role={tenant.role}
      plan={tenant.plan}
    >
      {children}
    </AppShell>
  );
}
