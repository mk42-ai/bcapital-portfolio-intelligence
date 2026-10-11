"use client";
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { FolderOpen, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CompanyLogo } from "@/components/ui/company-logo";
import "./company-picker.css";

/** Sector → [base tint, ink]. Local fallback (no `@/lib/sector-color` at branch time); no blue hue anywhere. */
const SECTOR_COLORS: Record<string, readonly [string, string]> = {
  technology: ["#0AC985", "#047857"],
  healthcare: ["#0D9488", "#115E59"],
  "energy & resilience": ["#F59E0B", "#92400E"],
  energy: ["#F59E0B", "#92400E"],
  financial: ["#A21CAF", "#701A75"],
  fintech: ["#A21CAF", "#701A75"],
  consumer: ["#F97316", "#9A3412"],
  industrial: ["#65A30D", "#3F6212"],
};
const OTHER: readonly [string, string] = ["#78716C", "#44403C"];
export function sectorColor(sector?: string | null): { base: string; ink: string } {
  const key = (sector ?? "").trim().toLowerCase();
  const hit = SECTOR_COLORS[key] ?? Object.entries(SECTOR_COLORS).find(([k]) => key.includes(k))?.[1] ?? OTHER;
  return { base: hit[0], ink: hit[1] };
}

/** "N/5" counter — rendered inside the picker title, or by a host section title (inspector) via `counterInTitle`. */
export function ContextCounter({ count, max }: { count: number; max: number }) {
  return <span className="cp-counter" data-full={count >= max} data-testid="company-picker-count" aria-label={`${count} of ${max} selected`}>{count}/{max}</span>;
}

type Option = { slug: string; name: string; sector: string; logo_url?: string | null };

export function CompanyPicker({ options, value, onChange, max = 5, compact, title = "Companies", counterInTitle }: {
  options: Option[]; value: string[]; onChange: (v: string[]) => void; max?: number; compact?: boolean;
  /** Picker heading (carries the N/max counter). Ignored when `counterInTitle` — the host section title shows the counter. */
  title?: ReactNode; counterInTitle?: boolean;
}) {
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); return t ? options.filter((o) => o.name.toLowerCase().includes(t) || o.sector.toLowerCase().includes(t)).slice(0, 8) : []; }, [q, options]);
  const byslug = useMemo(() => Object.fromEntries(options.map((o) => [o.slug, o])), [options]);
  const full = value.length >= max;
  const add = (slug: string) => { if (value.includes(slug) || full) return; onChange([...value, slug]); setQ(""); };
  const remove = (slug: string, idx: number) => {
    onChange(value.filter((v) => v !== slug));
    // keep focus inside the chip row (previous chip, else the search input)
    requestAnimationFrame(() => {
      const chips = listRef.current?.querySelectorAll<HTMLElement>('[data-testid="context-chip"]');
      const next = chips?.[Math.max(0, idx - 1)];
      if (next && chips && chips.length > 0) next.focus(); else document.getElementById("company-search")?.focus();
    });
  };
  const onChipKey = (e: KeyboardEvent<HTMLElement>, slug: string, idx: number) => {
    if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); remove(slug, idx); }
  };
  return (
    <div data-testid="company-picker">
      {!counterInTitle && <div className="cp-head"><span>{title}</span><ContextCounter count={value.length} max={max} /></div>}
      <div ref={listRef} className="cp-chips" aria-live="polite" aria-label="Selected companies">
        {value.length === 0 && !compact && (
          <div className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted"><FolderOpen className="size-5 shrink-0" aria-hidden /> No companies selected yet — choose up to {max}.</div>
        )}
        {value.map((slug, idx) => {
          const o = byslug[slug]; const name = o?.name ?? slug; const c = sectorColor(o?.sector);
          return (
            <span key={slug} data-testid="company-chip" className="contents"><span className="context-chip" data-testid="context-chip" data-slug={slug} data-sector={o?.sector ?? ""} tabIndex={0} role="group" aria-label={`${name}${o?.sector ? `, ${o.sector}` : ""}`}
              style={{ "--chip-base": c.base, "--chip-ink": c.ink } as CSSProperties} onKeyDown={(e) => onChipKey(e, slug, idx)}>
              <CompanyLogo name={name} src={o?.logo_url} slug={slug} size={16} />
              <span className="context-chip__name">{name}</span>
              <button type="button" className="context-chip__remove" onClick={() => remove(slug, idx)} aria-label={`Remove ${name} from context`} data-testid="context-chip-remove" title="Remove"><X aria-hidden /></button>
            </span></span>
          );
        })}
      </div>
      <div className="relative mt-2">
        <label htmlFor="company-search" className="sr-only">Add a company</label>
        <Input id="company-search" role="combobox" aria-expanded={hits.length > 0} aria-controls="company-search-list" aria-autocomplete="list" placeholder={full ? `${max} of ${max} selected` : `Add a company (max ${max})`} value={q} onChange={(e) => setQ(e.target.value)} disabled={full} aria-describedby={full ? "company-picker-max" : undefined}
          onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); add(hits[0].slug); } if (e.key === "Escape") setQ(""); if (e.key === "Backspace" && q === "" && value.length) { const el = listRef.current?.querySelectorAll<HTMLElement>('[data-testid="context-chip"]'); el?.[el.length - 1]?.focus(); } }} />
        {hits.length > 0 && (
          <ul id="company-search-list" role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
            {hits.map((h) => <li key={h.slug} role="option" aria-selected={value.includes(h.slug)}><button type="button" onClick={() => add(h.slug)} className="flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2"><span className="inline-flex items-center gap-2"><CompanyLogo name={h.name} src={h.logo_url} slug={h.slug} size={16} />{h.name}</span><span className="text-xs text-muted">{h.sector}</span></button></li>)}
          </ul>
        )}
      </div>
      {full && <p id="company-picker-max" role="status" data-testid="company-picker-max" className="cp-max">Remove a company to add another.</p>}
    </div>
  );
}
