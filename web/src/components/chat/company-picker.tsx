"use client";
import { useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
export function CompanyPicker({ options, value, onChange, max = 5, compact }: { options: { slug: string; name: string; sector: string }[]; value: string[]; onChange: (v: string[]) => void; max?: number; compact?: boolean }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); return t ? options.filter((o) => o.name.toLowerCase().includes(t) || o.sector.toLowerCase().includes(t)).slice(0, 8) : []; }, [q, options]);
  const byslug = useMemo(() => Object.fromEntries(options.map((o) => [o.slug, o])), [options]);
  const add = (slug: string) => { if (value.includes(slug) || value.length >= max) return; onChange([...value, slug]); setQ(""); };
  return (
    <div>
      <div className="flex flex-wrap gap-2" aria-live="polite" aria-label="Selected companies">
        {value.length === 0 && !compact && (
          <div className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted"><FolderOpen className="size-5 shrink-0" aria-hidden /> No companies selected yet — choose up to {max}.</div>
        )}
        {value.map((slug) => (
          <Badge key={slug} tone="primary" className="pr-1">
            {byslug[slug]?.name ?? slug}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== slug))} className="tap ml-1 grid size-6 place-items-center rounded-full hover:bg-primary/25" aria-label={`Remove ${byslug[slug]?.name ?? slug}`}><X className="size-3.5" aria-hidden /></button>
          </Badge>
        ))}
      </div>
      <div className="relative mt-2">
        <label htmlFor="company-search" className="sr-only">Search companies</label>
        <Input id="company-search" role="combobox" aria-expanded={hits.length > 0} aria-controls="company-search-list" aria-autocomplete="list" placeholder={value.length >= max ? `Maximum ${max} selected` : "Search companies…"} value={q} onChange={(e) => setQ(e.target.value)} disabled={value.length >= max}
          onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); add(hits[0].slug); } if (e.key === "Escape") setQ(""); }} />
        {hits.length > 0 && (
          <ul id="company-search-list" role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
            {hits.map((h) => <li key={h.slug} role="option" aria-selected={value.includes(h.slug)}><button type="button" onClick={() => add(h.slug)} className="flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2"><span>{h.name}</span><span className="text-xs text-muted">{h.sector}</span></button></li>)}
          </ul>
        )}
      </div>
      <p className="mt-1 text-xs text-muted" data-testid="company-picker-count">{value.length}/{max} selected · Enter adds the first match</p>
      {value.length >= max && <p role="status" data-testid="company-picker-max" className="mt-1 text-xs text-danger">Maximum of {max} companies reached — remove one to add another.</p>}
    </div>
  );
}
