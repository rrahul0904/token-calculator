import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Token Intelligence — LLM Token & Cost Calculator",
  description: "Private browser-based token counting, model pricing comparison, context planning, and LLM cost forecasting.",
  applicationName: "Token Intelligence",
  metadataBase: new URL("https://token-calculator.vercel.app"),
  openGraph: {
    title: "Token Intelligence",
    description: "Know your LLM token cost before you ship.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
