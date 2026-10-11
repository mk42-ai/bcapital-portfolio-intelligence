"use client";
/** Minimal `toast.error` for the ported chat (the spec's §7 calls toast.error; this app has no toast library). */
import { useSyncExternalStore } from "react";

type Toast = { id: number; message: string };
let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const toast = {
  error(message: string) {
    const id = ++seq;
    toasts = [...toasts, { id, message }];
    emit();
    setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 4000);
  },
};

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const EMPTY: Toast[] = [];

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto rounded-md border border-red-200 bg-white px-4 py-2 text-sm text-red-700 shadow-lg">{t.message}</div>
      ))}
    </div>
  );
}
