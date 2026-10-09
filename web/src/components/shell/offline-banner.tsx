"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
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
    <div role="status" aria-live="polite" className="flex items-center gap-2 border-b border-accent/50 bg-accent/15 px-4 py-2 text-sm text-accent-soft">
      <WifiOff className="size-4" aria-hidden /> You are offline — showing the last cached portfolio snapshot. Chat and live refresh are paused.
    </div>
  );
}
