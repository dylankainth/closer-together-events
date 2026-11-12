import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = { title: "Muse Events", description: "Partiful-style events inside Facebook, powered by Muse." };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
