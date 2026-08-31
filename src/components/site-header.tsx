"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const nav = [
  { href: "/", label: "Calculator" },
  { href: "/models", label: "Models" },
  { href: "/tools/cost", label: "Cost Lab" },
  { href: "/tools/memory", label: "GPU RAM" },
  { href: "/tools/speed", label: "Speed" },
  { href: "/developers", label: "API" },
];

export function SiteHeader() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const stored = window.localStorage.getItem("token-intelligence-theme");
    const nextTheme = stored === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);
  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("token-intelligence-theme", nextTheme);
  }
  return <header className="site-header"><div className="shell site-header__inner"><Link href="/" className="brand" aria-label="Token Intelligence home"><span className="brand-mark">TI</span><span>Token Intelligence</span></Link><nav className="site-nav" aria-label="Primary navigation">{nav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav><div className="site-header__actions"><Link href="/pricing" className="button button--ghost header-plan">Plans</Link><button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "☾"}</button></div></div></header>;
}
