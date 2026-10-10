"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Chooses the page frame by route: /chat gets the full-bleed canvas (the thread owns the whole main column, no footer, no 1400 px cap);
 * every other route keeps the centred column + footer. Children are server-rendered and passed through untouched.
 */
export function PageFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path?.startsWith("/chat")) return <main id="main" tabIndex={-1} className="chat-main flex min-h-0 flex-1 flex-col" data-testid="chat-main">{children}</main>;
  return (
    <>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <footer className="border-t border-border px-4 py-4 text-xs text-muted sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
          <span>© 2026 B Capital · We empower entrepreneurs to think bigger. Scale faster. Grow global.</span>
          <span>Data: portfolio backend + OnDemand Flow Builder (06:00 UTC daily) · <Link href="/settings" className="underline underline-offset-2">Help & settings</Link> · <Link href="/docs/interactive-ui" className="underline underline-offset-2" data-testid="footer-docs-link">Why the chat is interactive</Link></span>
        </div>
      </footer>
    </>
  );
}
