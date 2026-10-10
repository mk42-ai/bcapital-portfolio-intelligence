"use client";
import * as React from "react";
import { Pin, Plug, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PluginFavicon } from "@/components/ui/plugin-favicon";
import { PLUGIN_CATALOGUE, PINNED_PLUGIN_ID, mergeLivePlugins, type LivePlugin, type PluginMeta } from "@/lib/plugin-catalogue";
import { setKnownPluginIds, usePluginSelection } from "@/lib/plugin-selection";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  general: "general",
  finance: "finance",
  marketing: "marketing",
  research_and_insights: "research",
  data_and_analytics: "data",
};

type LiveState = { source: "loading" | "live" | "curated"; list: PluginMeta[]; error?: string };

type ApiPluginsPayload = { fetchedAt?: string; total?: number; plugins?: LivePlugin[]; error?: string };

/** Module-level cache so rail + settings variants share one `/api/plugins` round-trip per page load. */
let livePromise: Promise<LiveState> | null = null;
function loadLive(): Promise<LiveState> {
  if (livePromise) return livePromise;
  livePromise = (async (): Promise<LiveState> => {
    try {
      const r = await fetch("/api/plugins", { cache: "no-store", headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as ApiPluginsPayload;
      const live = Array.isArray(body.plugins) ? body.plugins : [];
      if (!live.length) return { source: "curated", list: PLUGIN_CATALOGUE, error: body.error ?? "empty live list" };
      return { source: "live", list: mergeLivePlugins(live) };
    } catch (e) {
      return { source: "curated", list: PLUGIN_CATALOGUE, error: e instanceof Error ? e.message : "fetch failed" };
    }
  })();
  return livePromise;
}

export function PluginPanel({ variant = "rail", testId = "sidebar-plugins", className }: { variant?: "rail" | "settings"; testId?: string; className?: string }) {
  const [selected, sel] = usePluginSelection();
  const [live, setLive] = React.useState<LiveState>({ source: "loading", list: PLUGIN_CATALOGUE });
  const [filter, setFilter] = React.useState("");
  const roomy = variant === "settings";

  React.useEffect(() => {
    let alive = true;
    loadLive().then((st) => {
      if (!alive) return;
      setKnownPluginIds(st.list.map((p) => p.id));
      setLive(st);
    });
    return () => { alive = false; };
  }, []);

  const list = live.list;
  const total = list.length;
  const on = selected.length;
  const showFilter = total > 12;
  const q = filter.trim().toLowerCase();
  const visible = q ? list.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q) || (CATEGORY_LABEL[p.category] ?? p.category).includes(q)) : list;

  return (
    <section data-testid={testId} data-variant={variant} data-selected={selected.join(",")} data-source={live.source} aria-label="Plugins" className={cn("min-w-0", className)}>
      <h3 className={cn("mb-1 flex items-center gap-1.5 font-semibold", roomy ? "text-sm" : "text-xs")}>
        <Plug size={roomy ? 16 : 14} aria-hidden="true" className="text-muted" />
        <span data-testid="plugin-panel-count">Plugins ({total} available · {on} on this turn)</span>
        {on > 1 && (
          <button type="button" data-testid="plugin-reset" onClick={() => sel.reset()} title="Turn off every optional plugin (Perplexity stays on)" className="ml-auto inline-flex items-center gap-1 text-[10px] font-normal text-muted hover:text-foreground">
            <RotateCcw size={10} aria-hidden="true" />reset
          </button>
        )}
      </h3>
      <p className={cn("mb-2 text-muted", roomy ? "text-xs" : "text-[10px]")} data-testid="plugins-source" data-source={live.source} data-count={total}>
        {live.source === "live" && <>live directory · {total} plugins · selection applies per turn</>}
        {live.source === "curated" && <>live list unavailable — showing curated ({total}) · selection applies per turn</>}
        {live.source === "loading" && <>loading live directory… showing curated ({total})</>}
      </p>
      {showFilter && (
        <input
          type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter plugins…" aria-label="Filter plugins"
          data-testid="plugin-filter"
          className={cn("mb-2 w-full rounded-md border border-border bg-surface-1 px-2 py-1 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-ring", roomy ? "text-sm" : "text-xs")}
        />
      )}
      <ul className={cn("divide-y divide-border", roomy ? "" : "max-h-[50vh] overflow-y-auto text-xs")} role="list">
        {visible.map((p) => {
          const pinned = p.pinned || p.id === PINNED_PLUGIN_ID;
          const checked = pinned || sel.isOn(p.id);
          return (
            <li key={p.id} data-plugin-id={p.id} data-pinned={pinned ? "true" : undefined} className={cn("flex items-center justify-between gap-3", roomy ? "py-3" : "py-2")}>
              <div className="flex min-w-0 items-start gap-2">
                <PluginFavicon meta={p} size={20} className="mt-0.5" />
                <div className="min-w-0">
                  <p className={cn("flex flex-wrap items-center gap-1.5 font-medium leading-tight", roomy ? "text-sm" : "text-xs")}>
                    <span className="truncate">{p.name}</span>
                    <Badge tone={pinned ? "primary" : "muted"} className={roomy ? "" : "text-[10px]"}>{CATEGORY_LABEL[p.category] ?? p.category}</Badge>
                    {pinned && <Badge tone="primary" className={cn("inline-flex items-center gap-1", roomy ? "" : "text-[10px]")}><Pin size={10} aria-hidden="true" />locked on</Badge>}
                  </p>
                  <p className={cn("font-mono text-muted", roomy ? "text-xs" : "text-[10px]")}>{p.id}</p>
                  {roomy && p.description && <p className="mt-0.5 text-xs text-muted">{p.description}</p>}
                </div>
              </div>
              <Switch
                aria-label={pinned ? `${p.name} (locked on)` : `Use ${p.name} this turn`} data-testid="plugin-toggle" data-plugin-id={p.id} data-pinned={pinned ? "true" : undefined}
                checked={checked} disabled={pinned}
                onCheckedChange={(v) => sel.toggle(p.id, v)}
                className={roomy ? "" : "h-5 w-9 [&>span]:h-4 [&>span]:w-4 [&>span[data-state=checked]]:translate-x-4"}
              />
            </li>
          );
        })}
        {visible.length === 0 && <li className="py-2 text-muted" data-testid="plugin-filter-empty">No plugins match “{filter}”.</li>}
      </ul>
      <p className={cn("mt-2 text-muted", roomy ? "text-xs" : "text-[10px]")} data-testid="plugin-panel-footer">Per turn: sent explicitly as <code>pluginIds</code> on the next request — nothing is substituted if a plugin fails.</p>
    </section>
  );
}
