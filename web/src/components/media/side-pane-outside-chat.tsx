"use client";
import { usePathname } from "next/navigation";
import { SidePane } from "./side-pane";
/** /chat mounts <SidePane/> inside its own row (side-by-side with the thread); every other route gets it from the Shell so Artifacts page/panel "Open" works everywhere. */
export function SidePaneOutsideChat() {
  const path = usePathname();
  if (path?.startsWith("/chat")) return null;
  // Outside /chat there is no flex row: .art-page-pane docks the pane to the right edge as an overlay (media.css); <1024px it is the full-screen sheet.
  return <div className="art-page-pane"><SidePane /></div>;
}
