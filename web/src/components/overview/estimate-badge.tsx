"use client";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
export function EstimateBadge({ confidence, rationale, compact }: { confidence: string; rationale: string; compact?: boolean }) {
  const tone = confidence === "high" ? "primary" : confidence === "medium" ? "info" : "accent";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="tap inline-flex items-center gap-1 rounded-full focus-visible:outline-3 focus-visible:outline-ring" aria-label={`${compact ? "est." : "estimate"} · ${confidence} — ${rationale}`}>
          <Badge tone={tone}>{compact ? "est." : "estimate"} · {confidence}<Info className="size-3" aria-hidden /></Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent><p className="font-semibold">estimate_confidence: {confidence}</p><p className="mt-1">{rationale}</p></TooltipContent>
    </Tooltip>
  );
}
