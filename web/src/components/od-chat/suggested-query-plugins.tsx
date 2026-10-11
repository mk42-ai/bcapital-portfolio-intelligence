"use client";
/** §8.8 SuggestedQueryPlugins. The spec's `<Tooltip content position>` is adapted to this app's Radix tooltip. */
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_PLUGIN_LOGO_URL } from "./plugin-logo";
import ShimmerText from "./shimmer-text";
import StatusAccordion from "./status-accordion";
import type { SuggestedPluginSummary } from "./types";

export default function SuggestedQueryPlugins({ isSuggestingPlugins, hasSuggestedPlugins, suggestedPlugins = [] }: {
  isSuggestingPlugins: boolean; hasSuggestedPlugins: boolean; suggestedPlugins?: SuggestedPluginSummary[];
}) {
  if (isSuggestingPlugins) {
    return <StatusAccordion title={<ShimmerText text="Finding Plugins" className="ml-2 mt-1 text-sm" />} collapsible={false} status="loading" />;
  }
  if (!hasSuggestedPlugins || !suggestedPlugins.length) return null;
  return (
    <div className="ml-2 mt-1 flex flex-wrap items-center gap-2">
      <p className="text-sm text-neutral-300 dark:text-neutral-400">Suggested plugins</p>
      <div className="flex flex-wrap items-center gap-1">
        {suggestedPlugins.map((p) => (
          <Tooltip key={p.pluginId || p.id}>
            <TooltipTrigger asChild>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.logoUrl} alt={p.name} className="size-6 rounded-[6px]" onError={(e) => { e.currentTarget.src = DEFAULT_PLUGIN_LOGO_URL; }} />
            </TooltipTrigger>
            <TooltipContent side="top">{p.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
