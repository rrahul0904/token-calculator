import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PulseAtlasPageView } from "@/components/pulseatlas-page-view";
import { getPublicSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./features.css";
import "./commercial.css";
import "./premium.css";
import "./professional.css";

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  title: { default: "Token Intelligence — AI Economics Control Plane", template: "%s · Token Intelligence" },
  description: "Estimate AI workload economics before execution, trace agent spend, reconcile provider usage, govern budgets, and verify outcomes without storing prompts by default.",
  applicationName: "Token Intelligence",
  openGraph: { title: "Token Intelligence", description: "AI FinOps, ContextOps, governance and agent economics from pre-flight estimates to outcome verification.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="light" suppressHydrationWarning><body><PulseAtlasPageView /><SiteHeader />{children}</body></html>;
}
