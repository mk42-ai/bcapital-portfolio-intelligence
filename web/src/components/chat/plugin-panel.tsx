"use client";
import * as React from "react";
import { Pin, Plug, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PluginFavicon } from "@/components/ui/plugin-favicon";
import {
  PLUGIN_CATALOGUE, PINNED_PLUGIN_ID, MERGED_LIST_CAP, mergeLivePlugins, fullPluginDirectory, searchPluginDirectory, pluginState, pluginStateTitle,
  applyPluginStateSnapshot, type LivePlugin, type PluginMeta, type PluginState,
} from "@/lib/plugin-catalogue";
import { setKnownPluginIds, usePluginSelection } from "@/lib/plugin-selection";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  general: "general",
  finance: "finance",
  marketing: "marketing",
  research_and_insights: "research",
  data_and_analytics: "data",
};

type LiveState = { source: "loading" | "live" | "curated"; list: PluginMeta[]; directoryTotal: number; error?: string };

type StateSnapshot = { blocked?: Record<string, string>; invoked?: string[]; authorized?: string[]; owned?: string[] };
type ApiPluginsPayload = { fetchedAt?: string; total?: number; plugins?: LivePlugin[]; owned?: string[]; states?: StateSnapshot; error?: string };

/** Badge tone per honest plugin state (plugin-catalogue.ts `pluginState`). */
const STATE_TONE: Record<PluginState, "danger" | "solid" | "primary" | "accent" | "info" | "default" | "muted"> = {
  blocked: "danger", invoked: "solid", selected: "primary", installed: "accent", authorized: "info", connected: "default", suggested: "muted",
};
/** Poll cadence for the in-memory state snapshot (`/api/plugins?states=1`, no upstream call) so badges follow the last run. */
const STATE_POLL_MS = 15_000;

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
      if (body.states || body.owned) applyPluginStateSnapshot({ ...(body.states ?? {}), ...(body.owned ? { owned: body.owned } : {}) });
      if (!live.length) return { source: "curated", list: PLUGIN_CATALOGUE, directoryTotal: PLUGIN_CATALOGUE.length, error: body.error ?? "empty live list" };
      const merged = mergeLivePlugins(live);
      return { source: "live", list: merged, directoryTotal: fullPluginDirectory().length };
    } catch (e) {
      return { source: "curated", list: PLUGIN_CATALOGUE, directoryTotal: PLUGIN_CATALOGUE.length, error: e instanceof Error ? e.message : "fetch failed" };
    }
  })();
  return livePromise;
}

export function PluginPanel({ variant = "rail", testId = "sidebar-plugins", className }: { variant?: "rail" | "settings"; testId?: string; className?: string }) {
  const [selected, sel] = usePluginSelection();
  const [live, setLive] = React.useState<LiveState>({ source: "loading", list: PLUGIN_CATALOGUE, directoryTotal: PLUGIN_CATALOGUE.length });
  const [filter, setFilter] = React.useState("");
  const [stateTick, setStateTick] = React.useState(0);
  // Plugin states live in a client-side store (hydrated from /api/plugins and the per-turn selection); render the badges only after mount so
  // the server HTML and the first client render are identical (avoids React hydration error #418).
  const [mounted, setMounted] = React.useState(false); React.useEffect(() => { setMounted(true); }, []);
  const roomy = variant === "settings";

  React.useEffect(() => {
    let alive = true;
    loadLive().then((st) => {
      if (!alive) return;
      // Every live chat plugin is selectable (the search box reaches all of them), not only the 40-row merged view.
      setKnownPluginIds((fullPluginDirectory().length ? fullPluginDirectory() : st.list).map((p) => p.id));
      setLive(st);
    });
    return () => { alive = false; };
  }, []);

  // Keep the state badges truthful after each run: poll the server's in-memory snapshot (blocked/invoked/authorized/owned), also on tab focus.
  React.useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/plugins?states=1", { cache: "no-store", headers: { accept: "application/json" } });
        if (!r.ok) return; const body = (await r.json()) as ApiPluginsPayload;
        if (alive && body.states) { applyPluginStateSnapshot(body.states); setStateTick((t) => t + 1); }
      } catch { /* badges keep the last snapshot */ }
    };
    const id = setInterval(poll, STATE_POLL_MS);
    const onFocus = () => { void poll(); };
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);

  const list = live.list;
  const total = list.length;
  const on = selected.length;
  const showFilter = total > 12;
  const q = filter.trim().toLowerCase();
  // Typing searches the FULL live directory (all chat plugins /api/plugins paginated — 182 at last probe); idle shows the merged 40.
  const directoryTotal = live.source === "live" ? live.directoryTotal : total;
  const searched = q ? searchPluginDirectory(q, MERGED_LIST_CAP) : null;
  const visible = searched ? searched.matches : list.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q) || (CATEGORY_LABEL[p.category] ?? p.category).includes(q));
  const matchTotal = searched ? searched.total : visible.length;
  void stateTick; // re-render trigger for the badges below

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
          type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Search all ${directoryTotal} plugins…`} aria-label="Search all plugins"
          data-testid="plugin-filter" data-directory-total={directoryTotal}
          className={cn("mb-2 w-full rounded-md border border-border bg-surface-1 px-2 py-1 text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-ring", roomy ? "text-sm" : "text-xs")}
        />
      )}
      {showFilter && (
        <p className={cn("mb-1 text-muted", roomy ? "text-xs" : "text-[10px]")} data-testid="plugin-showing" data-shown={visible.length} data-matches={matchTotal} data-total={directoryTotal}>
          {q ? <>Showing {visible.length} of {matchTotal} match{matchTotal === 1 ? "" : "es"} · searched {directoryTotal} plugins</> : <>Showing {visible.length} of {directoryTotal}</>}
        </p>
      )}
      <ul className={cn("divide-y divide-border", roomy ? "" : "max-h-[32vh] overflow-y-auto text-xs")} role="list">
        {visible.map((p) => {
          const pinned = p.pinned || p.id === PINNED_PLUGIN_ID;
          const checked = pinned || sel.isOn(p.id);
          const state = mounted ? pluginState(p, { selected }) : "suggested";
          const stateTitle = pluginStateTitle(p.id, state);
          return (
            <li key={p.id} data-plugin-id={p.id} data-pinned={pinned ? "true" : undefined} data-plugin-state={state} className={cn("flex items-center justify-between gap-3", roomy ? "py-3" : "py-2")}>
              <div className="flex min-w-0 items-start gap-2">
                <PluginFavicon meta={p} size={20} className="mt-0.5" />
                <div className="min-w-0">
                  <p className={cn("flex flex-wrap items-center gap-1.5 font-medium leading-tight", roomy ? "text-sm" : "text-xs")}>
                    <span className="truncate">{p.name}</span>
                    <Badge tone={pinned ? "primary" : "muted"} className={roomy ? "" : "text-[10px]"}>{CATEGORY_LABEL[p.category] ?? p.category}</Badge>
                    {pinned && <Badge tone="primary" className={cn("inline-flex items-center gap-1", roomy ? "" : "text-[10px]")}><Pin size={10} aria-hidden="true" />locked on</Badge>}
                    <Badge tone={STATE_TONE[state]} data-testid="plugin-state" data-state={state} data-plugin-id={p.id} title={stateTitle} aria-label={`${p.name}: ${state}`} className={roomy ? "" : "text-[10px]"}>{state}</Badge>
                  </p>
                  {roomy && <p className="font-mono text-xs text-muted">{p.id}</p>}
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
        {visible.length === 0 && <li className="py-2 text-muted" data-testid="plugin-filter-empty">No plugins match “{filter}” (searched {directoryTotal}).</li>}
      </ul>
      <p className={cn("mt-2 text-muted", roomy ? "text-xs" : "text-[10px]")} data-testid="plugin-panel-footer">Applies to your next question — nothing is substituted if a plugin fails.</p>
    </section>
  );
}
