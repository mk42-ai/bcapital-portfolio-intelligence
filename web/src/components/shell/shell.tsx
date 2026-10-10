import { NavRail } from "./nav-rail";
import { OfflineBanner } from "./offline-banner";
import { OnboardingGate } from "./onboarding-gate";
import { BackendStatus } from "./backend-status";
import { PageFrame } from "./page-frame";

/**
 * App frame: ONE primary rail (NavRail, ≤224 px, collapses to icons) + the main column. The window stays the scroll container for
 * every page (the companies list uses a window virtualizer); /chat sizes itself to the viewport (see PageFrame) so the thread scrolls internally.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row" data-testid="app-shell">
      <NavRail status={<BackendStatus />} />
      <div className="flex min-w-0 flex-1 flex-col" data-testid="main-column">
        <OfflineBanner />
        <PageFrame>{children}</PageFrame>
      </div>
      <OnboardingGate />
    </div>
  );
}

