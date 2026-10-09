import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Shell } from "@/components/shell/shell";
import { TooltipProvider } from "@/components/ui/tooltip";

/* Brand typefaces: Reckless Neue (display) + Yellix (body) are licensed fonts not bundled here; the licensed fallbacks
   Fraunces (display) and Inter (body) are self-hosted, subset to Latin, preloaded, font-display: swap. */
const display = localFont({ src: "../fonts/fraunces-latin.woff2", variable: "--font-display", display: "swap", preload: true, weight: "400 700", fallback: ["Reckless Neue", "Georgia", "serif"], adjustFontFallback: "Times New Roman" });
const body = localFont({ src: "../fonts/inter-latin.woff2", variable: "--font-body", display: "swap", preload: true, weight: "400 700", fallback: ["Yellix", "system-ui", "sans-serif"], adjustFontFallback: "Arial" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://bcap-portfolio-intelligence.vercel.run"),
  title: { default: "B Capital Portfolio Intelligence", template: "%s · B Capital Portfolio Intelligence" },
  description: "Portfolio overview, company brand intelligence, daily news pulse and an OnDemand-powered analyst chat for B Capital's 135 portfolio companies.",
  applicationName: "B Capital Portfolio Intelligence",
  openGraph: { title: "B Capital Portfolio Intelligence", description: "Catalysts. Questioners. Visionaries.", type: "website" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`light ${display.variable} ${body.variable}`} style={{ colorScheme: "light" }}>
      <body>
        <a href="#main" className="sr-only sr-only-focusable fixed left-2 top-2 z-[100] rounded-md bg-primary px-3 py-2 text-primary-foreground">Skip to main content</a>
        <TooltipProvider delayDuration={150}>
          <Shell>{children}</Shell>
        </TooltipProvider>
      </body>
    </html>
  );
}
