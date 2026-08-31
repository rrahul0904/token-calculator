import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token Intelligence — LLM Token & Cost Calculator",
  description: "Private browser-based token counting, model pricing comparison, context planning, and LLM cost forecasting.",
  applicationName: "Token Intelligence",
  openGraph: {
    title: "Token Intelligence",
    description: "Know your LLM token cost before you ship.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
