import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { Nav } from "./nav";
import { OfflineBanner } from "./offline-banner";
import { OnboardingGate } from "./onboarding-gate";
import { BackendStatus } from "./backend-status";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="sticky top-0 z-40 flex w-full items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 lg:h-dvh lg:w-56 lg:flex-col lg:items-stretch lg:justify-start lg:border-b-0 lg:border-r lg:px-4 lg:py-4">
        <Link href="/overview" className="flex flex-col items-start gap-1 rounded-lg px-1 py-1">
          <BrandLogo height={28} />
          <span className="hidden text-[11px] uppercase tracking-[0.14em] text-muted sm:block">Portfolio Intelligence</span><span className="sr-only">Home</span>
        </Link>
        <Nav />
        <div className="flex items-center lg:mt-3 lg:block lg:px-1"><BackendStatus /></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="border-t border-border px-4 py-4 text-xs text-muted sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
            <span>© 2026 B Capital · We empower entrepreneurs to think bigger. Scale faster. Grow global.</span>
            <span>Data: portfolio backend + OnDemand Flow Builder (06:00 UTC daily) · <Link href="/settings" className="underline underline-offset-2">Help & settings</Link> · <Link href="/docs/interactive-ui" className="underline underline-offset-2" data-testid="footer-docs-link">Why the chat is interactive</Link></span>
          </div>
        </footer>
      </div>
      <OnboardingGate />
    </div>
  );
}
