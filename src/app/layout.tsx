import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PulseAtlasPageView } from "@/components/pulseatlas-page-view";
import "./globals.css";
import "./features.css";
import "./commercial.css";
import "./premium.css";

export const metadata: Metadata = {
  title: { default: "Token Intelligence — AI Economics Control Plane", template: "%s · Token Intelligence" },
  description: "Estimate AI workload economics before execution, trace agent spend, reconcile provider usage, govern budgets, and verify whether optimizations actually worked.",
  applicationName: "Token Intelligence",
  openGraph: { title: "Token Intelligence", description: "The AI FinOps and governance command center for models, agents, spend, policy, and proof.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><PulseAtlasPageView /><SiteHeader />{children}</body></html>;
}
