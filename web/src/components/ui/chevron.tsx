import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chevron — the ONE disclosure chevron for every collapsible head in the run panel (Thinking / Outputs / Sources / Step summary).
 * 16px Lucide ChevronDown, #6B7280, right-aligned via `margin-left:auto`, rotates 180° in 150ms on `data-open="true"`;
 * `prefers-reduced-motion: reduce` disables the transition (see the a9 block in shell.css). Decorative only → `aria-hidden`.
 * Keeps the legacy `oiu-thinking__chev` class so existing container-state selectors keep working.
 */
export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return <ChevronDown className={cn("oiu-chevron oiu-thinking__chev", className)} data-open={open ? "true" : "false"} aria-hidden focusable="false" />;
}
