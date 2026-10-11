"use client";
import { useEffect, useState } from "react";
import { EMPTY_ICON_SRC } from "@/components/ui/empty-state";
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" aria-live="polite" data-testid="offline-banner" data-icon="offline" className="flex items-center gap-2 border-b border-accent/50 bg-accent/15 px-4 py-2 text-sm text-accent-soft">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
      <img src={EMPTY_ICON_SRC("offline")} width={20} height={20} alt="" aria-hidden className="size-5 shrink-0" /> You are offline — showing the cached snapshot. Chat and live refresh resume when you reconnect.
    </div>
  );
}
