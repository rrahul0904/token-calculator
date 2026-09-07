import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-console";
import { PlatformAdminAuthorizationError, requirePlatformAdmin } from "@/lib/admin/auth";
import { getExternalAuthSession } from "@/lib/auth/session";
import "./admin.css";

export const dynamic = "force-dynamic";

async function loadAdmin() {
  try { return await requirePlatformAdmin(); }
  catch (error) { if (error instanceof PlatformAdminAuthorizationError) { if (!(await getExternalAuthSession())) redirect("/sign-in"); notFound(); } throw error; }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await loadAdmin();
  return <AdminShell role={admin.role}>{children}</AdminShell>;
}
