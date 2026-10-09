"use client";
import { useEffect, useState } from "react";
export function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const target = Date.parse(iso);
  if (now === null || isNaN(target)) return <time dateTime={iso}>{iso}</time>;
  const d = target - now;
  if (d <= 0) return <time dateTime={iso}>{iso} (elapsed — still awaiting owner confirmation)</time>;
  const h = Math.floor(d / 3.6e6), m = Math.floor((d % 3.6e6) / 6e4), s = Math.floor((d % 6e4) / 1e3);
  return <time dateTime={iso} aria-live="off">{iso} (in {h}h {m}m {s}s)</time>;
}
