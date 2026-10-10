import "./nav-rail/nav-rail.css";
import { NavRail } from "./nav-rail/nav-rail";
import { OfflineBanner } from "./offline-banner";
import { OnboardingGate } from "./onboarding-gate";
import { BackendStatus } from "./backend-status";
import { MainFrame } from "./main-frame";

/** App frame: collapsible navigation rail (≤224 px / 64 px) + main column. No footer (Agent 19). /chat renders edge-to-edge (MainFrame). */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <NavRail status={<BackendStatus />} />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <MainFrame>{children}</MainFrame>
      </div>
      <OnboardingGate />
    </div>
  );
}
