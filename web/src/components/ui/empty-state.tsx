import { Inbox, FolderOpen, WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMPTY_STATE_BRAND_ICON, brandIconPath } from "@/lib/brand-icons";
const ICONS: Record<"news" | "picker" | "error", LucideIcon> = { news: Inbox, picker: FolderOpen, error: WifiOff };
/** Brand empty-state glyphs in /public/icons/empty (Lucide-style 24×24, charcoal strokes, ONE #0AC985 accent). */
export type EmptyIcon = "no-results" | "no-news" | "no-selection" | "offline";
export const EMPTY_ICON_SRC = (icon: EmptyIcon) => `/icons/empty/${icon}.svg`;
/** Empty state as invitation: short title (≤6 words), optional one-line body, ONE action.
 *  `icon` (brand SVG) wins over the Lucide `kind` glyph when both are given; `kind` is kept for existing callers. */
export function EmptyState({ kind = "news", icon, title, body, action, className, compact }: { kind?: keyof typeof ICONS; icon?: EmptyIcon; title: string; body?: string; action?: React.ReactNode; className?: string; compact?: boolean }) {
  const Icon = ICONS[kind];
  return (
    <div role="status" data-testid="empty-state" data-icon={icon ?? kind} className={cn("card flex flex-col items-center gap-3 text-center", compact ? "px-4 py-6" : "px-6 py-10", className)}>
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- static brand SVG, fixed box → no CLS
        <img src={EMPTY_STATE_BRAND_ICON[icon] ? brandIconPath(EMPTY_STATE_BRAND_ICON[icon]!) : EMPTY_ICON_SRC(icon)} width={40} height={40} alt="" aria-hidden className="size-10 rounded-md" loading="lazy" decoding="async" data-testid="brand-icon" data-slot={`empty-${icon}`} data-icon={EMPTY_STATE_BRAND_ICON[icon] ?? icon} />
      ) : (
        <span className="grid size-12 place-items-center rounded-full border border-border bg-surface-2 text-muted" aria-hidden><Icon className="size-6" strokeWidth={1.75} /></span>
      )}
      <h2 className={cn("font-semibold", compact ? "text-base" : "text-lg")}>{title}</h2>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}
