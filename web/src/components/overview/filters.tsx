"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bookmark, X } from "lucide-react";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
export type FilterState = { sector?: string; region?: string; stage?: string; status?: string; role?: string };
const KEY = "bcap.savedFilters.v1";
/** Filters are a plain GET form (progressive enhancement: works without JS; changing a select auto-submits). Saved filter sets live in localStorage. */
export function Filters({ sectors, regions, stages, statuses }: { sectors: string[]; regions: string[]; stages: string[]; statuses: string[] }) {
  const sp = useSearchParams(); const formRef = useRef<HTMLFormElement>(null);
  const cur: FilterState = { sector: sp.get("sector") ?? "", region: sp.get("region") ?? "", stage: sp.get("stage") ?? "", status: sp.get("status") ?? "", role: sp.get("role") ?? "" };
  const group = sp.get("group") ?? "";
  const [saved, setSaved] = useState<{ name: string; q: string }[]>([]);
  useEffect(() => { try { setSaved(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch {} }, []);
  const qs = useMemo(() => { const p = new URLSearchParams(); Object.entries(cur).forEach(([k, v]) => v && p.set(k, v)); return p.toString(); }, [cur.sector, cur.region, cur.stage, cur.status, cur.role]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => formRef.current?.requestSubmit();
  const save = () => { const name = window.prompt("Name this filter set:", [cur.sector, cur.region, cur.stage, cur.status, cur.role].filter(Boolean).join(" · ") || "All companies"); if (!name) return; const next = [...saved.filter((s) => s.name !== name), { name, q: qs }]; setSaved(next); localStorage.setItem(KEY, JSON.stringify(next)); };
  const Sel = ({ k, label, opts }: { k: keyof FilterState; label: string; opts: string[] }) => (
    <div className="flex min-w-[150px] flex-1 flex-col gap-1"><label htmlFor={`f-${k}`} className="text-xs font-medium text-muted">{label}</label>
      <Select id={`f-${k}`} name={k} defaultValue={cur[k]} onChange={submit}><option value="">All</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</Select></div>
  );
  return (
    <section aria-label="Filters" className="card mb-6 p-4">
      <form ref={formRef} method="get" action="/overview" className="flex flex-wrap items-end gap-3">
        {group && <input type="hidden" name="group" value={group} />}
        <Sel k="sector" label="Sector" opts={sectors} /><Sel k="region" label="Region" opts={regions} /><Sel k="stage" label="Stage" opts={stages} /><Sel k="status" label="Status" opts={statuses} />
        <Sel k="role" label="B Capital role" opts={["lead", "co-lead", "participant", "unknown"]} />
        <Button type="submit" variant="default">Apply</Button>
        <Button type="button" variant="secondary" onClick={save}><Bookmark aria-hidden />Save filter</Button>
        {qs && <Button type="button" variant="ghost" asChild><a href="/overview"><X aria-hidden />Clear</a></Button>}
      </form>
      {saved.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Saved filters"><span className="text-xs text-muted">Saved:</span>
          {saved.map((s) => <span key={s.name} className="inline-flex items-center gap-1"><Button size="sm" variant="outline" asChild><a href={`/overview?${s.q}`}>{s.name}</a></Button><button className="tap grid size-6 place-items-center rounded-full hover:bg-surface-2" aria-label={`Delete saved filter ${s.name}`} onClick={() => { const n = saved.filter((x) => x.name !== s.name); setSaved(n); localStorage.setItem(KEY, JSON.stringify(n)); }}><X className="size-3.5" aria-hidden /></button></span>)}
          <Badge tone="muted">stored in this browser</Badge>
        </div>
      )}
    </section>
  );
}
