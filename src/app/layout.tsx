import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PulseAtlasPageView } from "@/components/pulseatlas-page-view";
import { getPublicSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./features.css";
import "./commercial.css";

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  title: { default: "Token Intelligence — AI Workload Economics", template: "%s · Token Intelligence" },
  description: "Estimate AI workload cost before a run, trace agent economics during execution, reconcile actual usage, and control budgets without storing prompts by default.",
  applicationName: "Token Intelligence",
  openGraph: { title: "Token Intelligence", description: "AI FinOps, ContextOps and agent-run economics from pre-flight estimates to budget control.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><PulseAtlasPageView /><SiteHeader />{children}</body></html>;
}
