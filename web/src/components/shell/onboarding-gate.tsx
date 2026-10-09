"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSettings } from "@/lib/settings";
/** First-run redirect to /onboarding (client-only; respects an explicit ?skip=1 and never loops). */
export function OnboardingGate() {
  const path = usePathname(); const router = useRouter(); const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (checked) return; setChecked(true);
    if (path.startsWith("/onboarding") || path.startsWith("/api")) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("skip") === "1" || sp.get("e2e") === "1") return;
    if (!getSettings().onboarded) router.replace("/onboarding");
  }, [checked, path, router]);
  return null;
}
