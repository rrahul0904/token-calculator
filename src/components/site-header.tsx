"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { href: "/", label: "Calculator" },
  { href: "/models", label: "Models" },
  { href: "/guides", label: "Guides" },
  { href: "/tools/cost", label: "Cost Lab" },
  { href: "/pricing", label: "Pricing" },
  { href: "/developers", label: "Developers" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("token-intelligence-theme");
    const nextTheme = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  if (pathname.startsWith("/app")) return null;

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("token-intelligence-theme", nextTheme);
  }

  return (
    <>
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link href="/" className="brand" aria-label="Token Intelligence home">
          <span className="brand-mark">TI</span>
          <span>Token Intelligence</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          {nav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
            return <Link key={item.href} href={item.href} className={active ? "site-nav__link--active" : undefined}>{item.label}</Link>;
          })}
        </nav>
        <div className="site-header__actions">
          <button
            type="button"
            className="public-nav-toggle"
            aria-label={mobileOpen ? "Close public navigation" : "Open public navigation"}
            aria-expanded={mobileOpen}
            aria-controls="public-mobile-navigation"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? "Close" : "Menu"}
          </button>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <Link href="/sign-in" className="button button--ghost">Sign in</Link>
          <Link href="/app/overview" className="button button--primary header-cta">Workspace</Link>
        </div>
      </div>
    </header>
    {mobileOpen ? (
      <nav id="public-mobile-navigation" className="public-mobile-nav" aria-label="Mobile primary navigation">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={item.href === "/" ? (pathname === "/" ? "public-mobile-nav__active" : undefined) : (pathname === item.href || pathname.startsWith(item.href + "/") ? "public-mobile-nav__active" : undefined)}
            onClick={() => setMobileOpen(false)}
          >
            {item.label}
          </Link>
        ))}
        <Link href="/sign-in" onClick={() => setMobileOpen(false)}>Sign in</Link>
        <Link href="/app/overview" onClick={() => setMobileOpen(false)}>Workspace</Link>
      </nav>
    ) : null}
    </>
  );
}
