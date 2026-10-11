"use client";
import { usePathname } from "next/navigation";
import { SidePane } from "./side-pane";
/** /chat mounts <SidePane/> inside its own row (side-by-side with the thread); every other route gets it from the Shell so Artifacts page/panel "Open" works everywhere. */
export function SidePaneOutsideChat() {
  const path = usePathname();
  if (path?.startsWith("/chat")) return null;
  return <SidePane />;
}
