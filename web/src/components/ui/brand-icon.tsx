/* eslint-disable @next/next/no-img-element */
import { BRAND_ICONS, brandIconPath, type BrandIconName } from "@/lib/brand-icons";
import { cn } from "@/lib/utils";

/**
 * <BrandIcon/> — one of the ten 2026-10-11 flat-line brand icons (/brand/icons/icon-*.png, 1024², charcoal #1F2937 strokes, ONE
 * #0AC985 accent). Server-safe (no hooks). Fixed box → no CLS; `slot` names the UI slot for tests
 * (`[data-testid="brand-icon"][data-slot="outputs-step"]`). Decorative by default (alt="" + aria-hidden) unless `label` is given.
 */
export function BrandIcon({ name, size = 20, slot, title, label, className }: { name: BrandIconName; size?: number; slot: string; title?: string; label?: string; className?: string }) {
  const entry = BRAND_ICONS[name];
  return (
    <img
      src={brandIconPath(name)} width={size} height={size} alt={label ?? ""} aria-hidden={label ? undefined : true} title={title ?? entry.label}
      loading="eager" decoding="async" draggable={false}
      data-testid="brand-icon" data-icon={name} data-slot={slot}
      className={cn("inline-block shrink-0 rounded-[5px] bg-white object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
