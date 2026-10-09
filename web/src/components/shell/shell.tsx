import Link from "next/link";
import Image from "next/image";
import { Nav } from "./nav";
import { OfflineBanner } from "./offline-banner";
import { OnboardingGate } from "./onboarding-gate";
import { ThemeToggle } from "./theme-toggle";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="sticky top-0 z-40 flex w-full items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:h-dvh lg:w-64 lg:flex-col lg:items-stretch lg:justify-start lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <Link href="/overview" className="flex items-center gap-3 rounded-lg px-1 py-1">
          <Image src="/brand/bcapital-logo.png" alt="" width={36} height={36} priority className="rounded-md" />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="font-display text-base font-semibold">B Capital</span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted">Portfolio Intelligence</span>
          </span><span className="sr-only">Home</span>
        </Link>
        <Nav />
        <div className="hidden lg:mt-auto lg:block">
          <p className="mb-3 px-1 text-xs italic text-muted">Catalysts. Questioners. Visionaries.</p>
          <ThemeToggle />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="border-t border-border px-4 py-4 text-xs text-muted sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
            <span>© 2026 B Capital · We empower entrepreneurs to think bigger. Scale faster. Grow global.</span>
            <span>Data: portfolio backend + OnDemand Flow Builder (06:00 UTC daily) · <Link href="/settings" className="underline underline-offset-2">Help & settings</Link></span>
          </div>
        </footer>
      </div>
      <OnboardingGate />
    </div>
  );
}
