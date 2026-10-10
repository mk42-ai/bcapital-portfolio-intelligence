"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { faviconChain, pluginMeta, type PluginMeta } from "@/lib/plugin-catalogue";

export type PluginFaviconSource = "logo" | "logo-base" | "s2" | "monogram";
export type PluginFaviconSize = 14 | 16 | 20 | 24;

type Props = {
  id?: string;
  meta?: PluginMeta;
  size?: PluginFaviconSize;
  className?: string;
};

function sourceFor(url: string, m: PluginMeta | undefined): PluginFaviconSource {
  if (url.startsWith("https://www.google.com/s2/favicons")) return "s2";
  if (m?.logoUrlBase && url === m.logoUrlBase && url !== m.logoUrl) return "logo-base";
  return "logo";
}

/** Plugin favicon: walks faviconChain (live logoUrl → logoUrlBase → Google s2) on error / 0-width; final fallback = inline serif monogram tile. */
export function PluginFavicon({ id, meta, size = 20, className }: Props) {
  const m = meta ?? (id ? pluginMeta(id) : undefined);
  const name = m?.name ?? id ?? "?";
  const chainKey = m ? faviconChain(m).join("\n") : "";
  const chain = React.useMemo(() => (chainKey ? chainKey.split("\n") : []), [chainKey]);
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => { setIdx(0); }, [chainKey]);
  const url = chain[idx];
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  const px = { width: size, height: size };

  if (!url) {
    return (
      <span
        data-testid="plugin-favicon" data-source="monogram" data-plugin-id={m?.id ?? id} title={name} aria-hidden="true"
        className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-[5px] border border-border font-display leading-none text-foreground", className)}
        style={{ ...px, background: "var(--surface-3)", fontSize: Math.round(size * 0.6), fontFamily: "var(--font-display, Georgia, 'Times New Roman', serif)" }}
      >{letter}</span>
    );
  }

  const advance = () => setIdx((i) => i + 1);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={url}
      src={url} alt="" title={name} width={size} height={size}
      loading={size <= 24 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
      data-testid="plugin-favicon" data-source={sourceFor(url, m)} data-plugin-id={m?.id ?? id}
      className={cn("shrink-0 rounded-[5px] bg-surface-2 object-contain", className)}
      style={px}
      onError={advance} // network error, non-image body or decode failure → next hop
      onLoad={(e) => { if (e.currentTarget.naturalWidth === 0) advance(); }}
    />
  );
}

const preloaded = new Set<string>();
/** Warm the browser image cache for the given plugin ids once (idempotent). The fallback chain is walked by <PluginFavicon/>. */
export function preloadPluginFavicons(ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  for (const id of ids) {
    const m = pluginMeta(id);
    if (!m) continue;
    for (const url of faviconChain(m)) {
      if (preloaded.has(url)) continue;
      preloaded.add(url);
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.src = url;
    }
  }
}

/* ------------------------------------------------------------------ */
/* PluginChip — favicon strip chip for the source rail                 */
/* ------------------------------------------------------------------ */

export type PluginChipState = "queued" | "running" | "done" | "failed";

export type PluginChipProps = {
  id: string;
  meta?: PluginMeta;
  state: PluginChipState;
  /** The query / input the plugin was invoked with (first 120 chars go into the title). */
  input?: string;
  /** Raw SSE / tool frame — when provided the popover offers a "show raw frame" <pre>. */
  raw?: string;
  onOpenRaw?: (raw: string) => void;
  size?: PluginFaviconSize;
  className?: string;
};

const GREEN = "var(--brand-green, #16a34a)";
const RED = "var(--danger, #dc2626)";
const GREY = "var(--border, #9ca3af)";

const STATE_LABEL: Record<PluginChipState, string> = { queued: "queued", running: "running", done: "done", failed: "failed" };

export function PluginChip({ id, meta, state, input, raw, onOpenRaw, size = 16, className }: PluginChipProps) {
  const m = meta ?? pluginMeta(id);
  const name = m?.name ?? id;
  const [open, setOpen] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement>(null);
  const snippet = (input ?? "").slice(0, 120);
  const title = snippet ? `${name} — ${snippet}` : name;

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const ring =
    state === "running" ? `0 0 0 2px ${GREEN}` :
    state === "done" ? `0 0 0 1px ${GREEN}` :
    state === "failed" ? `0 0 0 1px ${RED}` :
    `0 0 0 1px ${GREY}`;
  const dotColor = state === "done" ? GREEN : state === "failed" ? RED : undefined;
  const dotPx = Math.max(7, Math.round(size * 0.45));

  return (
    <span ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        data-testid="plugin-chip" data-plugin-id={id} data-state={state}
        title={title} aria-label={`${name}: ${STATE_LABEL[state]}`} aria-expanded={open} aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={cn("relative inline-flex shrink-0 items-center justify-center rounded-[6px] bg-surface-2 p-[2px] transition-shadow focus-visible:outline-2 focus-visible:outline-ring", state === "running" && "motion-safe:animate-pulse", state === "queued" && "opacity-60 grayscale")}
        style={{ boxShadow: ring }}
      >
        <PluginFavicon id={id} meta={m} size={size} />
        {dotColor && (
          <span
            aria-hidden="true" data-testid="plugin-chip-dot"
            className="absolute -right-1 -bottom-1 inline-flex items-center justify-center rounded-full text-white"
            style={{ width: dotPx, height: dotPx, background: dotColor, fontSize: Math.round(dotPx * 0.8), lineHeight: 1, boxShadow: "0 0 0 1.5px var(--surface-1, #fff)" }}
          >
            {state === "done" ? (
              <svg viewBox="0 0 10 10" width={dotPx - 2} height={dotPx - 2} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2 2 4-4.4" /></svg>
            ) : (
              <svg viewBox="0 0 10 10" width={dotPx - 2} height={dotPx - 2} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /></svg>
            )}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog" aria-label={`${name} details`} data-testid="plugin-chip-popover" data-plugin-id={id}
          className="absolute left-0 top-full z-50 mt-1.5 w-72 max-w-[80vw] rounded-md border border-border bg-surface-1 p-2.5 text-left text-xs shadow-lg"
        >
          <p className="flex items-center gap-1.5 font-semibold"><PluginFavicon id={id} meta={m} size={14} /><span className="truncate">{name}</span><span className="ml-auto font-mono text-[10px] text-muted" data-testid="plugin-chip-popover-state">{STATE_LABEL[state]}</span></p>
          {input ? <p className="mt-1.5 whitespace-pre-wrap break-words text-foreground" data-testid="plugin-chip-popover-input">{input}</p> : <p className="mt-1.5 italic text-muted">no input recorded</p>}
          {raw && (
            <div className="mt-2">
              <button type="button" data-testid="plugin-chip-raw-toggle" className="font-mono text-[10px] underline-offset-2 hover:underline" onClick={() => { setShowRaw((s) => !s); onOpenRaw?.(raw); }}>
                {showRaw ? "hide raw frame" : "show raw frame"}
              </button>
              {showRaw && <pre data-testid="plugin-chip-raw" className="mt-1 max-h-40 overflow-auto rounded border border-border bg-surface-2 p-1.5 font-mono text-[10px] leading-snug">{raw}</pre>}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
