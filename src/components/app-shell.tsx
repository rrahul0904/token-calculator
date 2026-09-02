"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

type IconName =
  | "overview" | "lab" | "usage" | "runs" | "projects" | "budget"
  | "integrations" | "keys" | "finops" | "team" | "developer"
  | "billing" | "audit" | "settings" | "calculator" | "menu" | "close";

function Icon({ name }: { name: IconName }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 17.5h7M17.5 14v7"/></>,
    lab: <><path d="M9 3v5.2L4.8 17a2.7 2.7 0 0 0 2.4 4h9.6a2.7 2.7 0 0 0 2.4-4L15 8.2V3"/><path d="M7.2 14h9.6M8 3h8"/></>,
    usage: <><path d="M4 19V10M10 19V5M16 19v-7M22 19V8"/><path d="M2 19h22"/></>,
    runs: <><path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/><path d="M8 4V2M16 4V2"/></>,
    projects: <><path d="M3 7h7l2 2h9v10H3z"/><path d="M3 7V5h7l2 2"/></>,
    budget: <><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.8-.8-2-1.2-3.3-1.2-1.8 0-3.2.8-3.2 2.1 0 3.2 6.5 1.3 6.5 4.8 0 1.4-1.4 2.4-3.5 2.4-1.4 0-2.8-.5-3.7-1.4M12 5.5v13"/></>,
    integrations: <><path d="M8 12h8M12 8v8"/><circle cx="12" cy="12" r="4"/><path d="M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/></>,
    keys: <><circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/></>,
    finops: <><path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/><path d="M4 21h16"/></>,
    team: <><circle cx="9" cy="8" r="3"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.5c2.7.2 4.3 2 4.7 5.5"/></>,
    developer: <><path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></>,
    billing: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
    audit: <><path d="M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7.4 7.4 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a8 8 0 0 0-1.7 1L5 6.1 3 9.5 5 11a7.4 7.4 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 3.1h5l.4-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7.4 7.4 0 0 0 .1-1z"/></>,
    calculator: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    close: <><path d="M6 6l12 12M18 6L6 18"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const groups = [
  {
    label: "Analyze",
    items: [
      { href: "/app/cost-lab", label: "Cost Lab", icon: "lab" },
      { href: "/app/usage", label: "Usage", icon: "usage" },
      { href: "/app/runs", label: "Runs", icon: "runs" },
    ],
  },
  {
    label: "Control",
    items: [
      { href: "/app/projects", label: "Projects", icon: "projects" },
      { href: "/app/budgets", label: "Budgets & policies", icon: "budget" },
      { href: "/app/integrations", label: "Integrations", icon: "integrations" },
      { href: "/app/api-keys", label: "API keys", icon: "keys" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/app/finops", label: "FinOps command", icon: "finops" },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/app/team", label: "Members & teams", icon: "team" },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/app/billing", label: "Billing", icon: "billing" },
      { href: "/app/audit", label: "Audit", icon: "audit" },
      { href: "/app/settings", label: "Privacy & settings", icon: "settings" },
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigation = (
    <>
      <Link href="/app/overview" className={pathname === "/app/overview" ? "app-nav-link app-nav-link--active app-nav-link--overview" : "app-nav-link app-nav-link--overview"} onClick={() => setMobileOpen(false)}>
        <span className="app-nav-icon"><Icon name="overview" /></span><span>Overview</span>
      </Link>
      {groups.map((group) => (
        <details className="app-nav-group" key={group.label} open>
          <summary className="app-nav-label">{group.label}<span aria-hidden="true">⌄</span></summary>
          <div className="app-nav-items">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={active ? "app-nav-link app-nav-link--active" : "app-nav-link"} onClick={() => setMobileOpen(false)}>
                  <span className="app-nav-icon"><Icon name={item.icon} /></span><span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </details>
      ))}
    </>
  );

  return (
    <div className="app-frame">
      <aside className="app-sidebar" aria-label="Token Intelligence workspace navigation">
        <Link href="/app/overview" className="app-brand">
          <span className="app-brand__mark"><span>TI</span></span>
          <span className="app-brand__copy"><strong>Token Intelligence</strong><small>Economics control plane</small></span>
        </Link>

        <div className="workspace-switcher" aria-label="Current organization">
          <span className="workspace-switcher__signal" aria-hidden="true" />
          <div><span>{organizationName}</span><small>{plan.toUpperCase()} PLAN · {role}</small></div>
          <span className="workspace-switcher__chevron" aria-hidden="true">⌄</span>
        </div>

        <nav className="app-navigation" aria-label="Application navigation">{navigation}</nav>

        <div className="app-sidebar__footer">
          <div className="privacy-state">
            <span className="privacy-state__dot" aria-hidden="true" />
            <div><strong>Metadata only</strong><small>Prompt persistence off</small></div>
          </div>
          <Link href="/developers" className="app-nav-link"><span className="app-nav-icon"><Icon name="developer" /></span><span>Developer platform</span></Link>
          <Link href="/" className="app-nav-link"><span className="app-nav-icon"><Icon name="calculator" /></span><span>Public calculator</span></Link>
          <div className="app-user"><span className="app-user__avatar">{userName.slice(0, 1).toUpperCase()}</span><div><span>{userName}</span><small>{role}</small></div></div>
        </div>
      </aside>

      <div className={mobileOpen ? "mobile-scrim mobile-scrim--open" : "mobile-scrim"} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <aside className={mobileOpen ? "app-mobile-drawer app-mobile-drawer--open" : "app-mobile-drawer"} aria-label="Mobile workspace navigation">
        <div className="app-mobile-drawer__top">
          <Link href="/app/overview" className="app-brand" onClick={() => setMobileOpen(false)}><span className="app-brand__mark"><span>TI</span></span><span className="app-brand__copy"><strong>Token Intelligence</strong><small>Economics control plane</small></span></Link>
          <button type="button" className="icon-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><Icon name="close" /></button>
        </div>
        <nav className="app-navigation" aria-label="Mobile application navigation">{navigation}</nav>
      </aside>

      <div className="app-content-frame">
        <header className="app-command-bar">
          <button type="button" className="icon-button app-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <div className="command-context" aria-label="Workspace analysis context">
            <span className="command-context__item"><small>Scope</small><strong>Organization</strong></span>
            <span className="command-context__item"><small>Window</small><strong>30 days</strong></span>
            <span className="command-context__item command-context__item--wide"><small>Environment</small><strong>All observed</strong></span>
          </div>
          <div className="command-actions">
            <span className="command-plan">{plan}</span>
            <Link href="/app/cost-lab" className="command-button">Plan economics <span aria-hidden="true">→</span></Link>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
