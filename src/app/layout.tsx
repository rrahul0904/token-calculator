import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";
import "./features.css";

export const metadata: Metadata = {
  title: { default: "Token Intelligence — LLM Cost & Context Lab", template: "%s · Token Intelligence" },
  description: "Private token counting, model price comparison, context planning, LLM cost forecasting, GPU memory planning, and streaming simulations.",
  applicationName: "Token Intelligence",
  openGraph: { title: "Token Intelligence", description: "Plan token cost, context, memory, and latency before you ship AI workloads.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><SiteHeader />{children}</body></html>;
}
