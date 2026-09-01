"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const groups = [
  {
    label: "Workspace",
    items: [
      ["/app/overview", "Overview"],
      ["/app/cost-lab", "Cost Lab"],
      ["/app/usage", "Usage"],
      ["/app/finops", "FinOps"],
      ["/app/runs", "Agent Runs"],
      ["/app/projects", "Projects"],
    ],
  },
  {
    label: "Control",
    items: [
      ["/app/integrations", "Integrations"],
      ["/app/budgets", "Budgets & Alerts"],
    ],
  },
  {
    label: "Organization",
    items: [
      ["/app/team", "Team"],
      ["/app/api-keys", "API Keys"],
      ["/app/audit", "Audit"],
      ["/app/billing", "Billing"],
      ["/app/settings", "Settings"],
    ],
  },
] as const;

export interface AppShellProps {
  organizationName: string;
  userName: string;
  role: string;
  plan: string;
  children: ReactNode;
}

export function AppShell({ organizationName, userName, role, plan, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Link href="/app/overview" className="app-brand">
          <span className="app-brand__mark">TI</span>
          <span><strong>Token Intelligence</strong><small>Agent Economics</small></span>
        </Link>

        <div className="workspace-switcher">
          <span>{organizationName}</span>
          <small>{plan.toUpperCase()} · {role}</small>
        </div>

        <nav className="app-navigation" aria-label="Application navigation">
          {groups.map((group) => (
            <div className="app-nav-group" key={group.label}>
              <span className="app-nav-label">{group.label}</span>
              {group.items.map(([href, label]) => {
                const active = pathname === href || (href !== "/app/overview" && pathname.startsWith(`${href}/`));
                return <Link key={href} href={href} className={active ? "app-nav-link app-nav-link--active" : "app-nav-link"}>{label}</Link>;
              })}
            </div>
          ))}
        </nav>

        <div className="app-sidebar__footer">
          <Link href="/" className="app-nav-link">Public calculator</Link>
          <div className="app-user"><span>{userName}</span><small>{role}</small></div>
        </div>
      </aside>

      <div className="app-content-frame">
        <header className="app-mobile-bar">
          <Link href="/app/overview" className="app-brand"><span className="app-brand__mark">TI</span><strong>Token Intelligence</strong></Link>
          <span className="workspace-chip">{organizationName}</span>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
