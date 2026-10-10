"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { faviconChain, pluginMeta, type PluginMeta } from "@/lib/plugin-catalogue";

export type PluginFaviconSource = "logo" | "s2" | "monogram";

type Props = {
  id?: string;
  meta?: PluginMeta;
  size?: 16 | 20 | 24;
  className?: string;
};

function sourceFor(url: string): PluginFaviconSource {
  return url.startsWith("https://www.google.com/s2/favicons") ? "s2" : "logo";
}

/** Plugin favicon: walks faviconChain (logoUrl → Google s2) on error; final fallback = inline monogram tile. */
export function PluginFavicon({ id, meta, size = 20, className }: Props) {
  const m = meta ?? (id ? pluginMeta(id) : undefined);
  const name = m?.name ?? id ?? "?";
  const chain = React.useMemo(() => (m ? faviconChain(m) : []), [m]);
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => { setIdx(0); }, [chain]);
  const url = chain[idx];
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  const px = { width: size, height: size };

  if (!url) {
    return (
      <span
        data-testid="plugin-favicon" data-source="monogram" title={name} aria-hidden="true"
        className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-[5px] border border-border font-display leading-none text-foreground", className)}
        style={{ ...px, background: "var(--surface-3)", fontSize: Math.round(size * 0.6) }}
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
      data-testid="plugin-favicon" data-source={sourceFor(url)}
      className={cn("shrink-0 rounded-[5px] bg-surface-2 object-contain", className)}
      style={px}
      onError={advance}
      onLoad={(e) => { if (e.currentTarget.naturalWidth === 0) advance(); }}
    />
  );
}

const preloaded = new Set<string>();
/** Warm the browser image cache for the given plugin ids once (idempotent). Chain head only — the fallback chain is walked by <PluginFavicon/>. */
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
