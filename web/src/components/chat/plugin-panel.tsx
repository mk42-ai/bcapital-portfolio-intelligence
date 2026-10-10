"use client";
import { Pin, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PluginFavicon } from "@/components/ui/plugin-favicon";
import { PLUGIN_CATALOGUE, PINNED_PLUGIN_ID } from "@/lib/plugin-catalogue";
import { usePluginSelection } from "@/lib/plugin-selection";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  general: "general",
  finance: "finance",
  marketing: "marketing",
  research_and_insights: "research",
  data_and_analytics: "data",
};

export function PluginPanel({ variant = "rail", testId = "sidebar-plugins", className }: { variant?: "rail" | "settings"; testId?: string; className?: string }) {
  const [selected, sel] = usePluginSelection();
  const roomy = variant === "settings";
  const total = PLUGIN_CATALOGUE.length;
  const on = selected.length;
  return (
    <section data-testid={testId} data-variant={variant} data-selected={selected.join(",")} aria-label="Plugins" className={cn("min-w-0", className)}>
      <h3 className={cn("mb-2 flex items-center gap-1.5 font-semibold", roomy ? "text-sm" : "text-xs")}>
        <Plug size={roomy ? 16 : 14} aria-hidden="true" className="text-muted" />
        <span data-testid="plugin-panel-count">Plugins ({total} available · {on} on)</span>
      </h3>
      <ul className={cn("divide-y divide-border", roomy ? "" : "text-xs")} role="list">
        {PLUGIN_CATALOGUE.map((p) => {
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
                    {pinned && <Badge tone="primary" className={cn("inline-flex items-center gap-1", roomy ? "" : "text-[10px]")}><Pin size={10} aria-hidden="true" />pinned · always on</Badge>}
                  </p>
                  <p className={cn("font-mono text-muted", roomy ? "text-xs" : "text-[10px]")}>{p.id}</p>
                  {roomy && <p className="mt-0.5 text-xs text-muted">{p.description}</p>}
                </div>
              </div>
              <Switch
                aria-label={`Use ${p.name}`} data-testid="plugin-toggle" data-plugin-id={p.id}
                checked={checked} disabled={pinned}
                onCheckedChange={(v) => sel.toggle(p.id, v)}
                className={roomy ? "" : "h-5 w-9 [&>span]:h-4 [&>span]:w-4 [&>span[data-state=checked]]:translate-x-4"}
              />
            </li>
          );
        })}
      </ul>
      <p className={cn("mt-2 text-muted", roomy ? "text-xs" : "text-[10px]")} data-testid="plugin-panel-footer">Sent explicitly as <code>pluginIds</code> on every request — nothing is substituted if a plugin fails.</p>
    </section>
  );
}
