import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

// One typeface for every screen, matching the agent UI design.
const sans = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap" });

export const metadata: Metadata = {
  title: "Patty & Co. (demo) | Food Ordering Agent",
  description: "Open-source AI food-ordering agent demo for a fictional burger shop.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f5d3a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={sans.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
