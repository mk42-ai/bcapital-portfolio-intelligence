"use client";
import { useSettings } from "@/lib/settings";
import { PLUGINS, MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { CompanyPicker } from "./company-picker";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { fmtScore } from "@/lib/format";
import { CompanyLogo } from "@/components/ui/company-logo";
export function ChatSidebar({ companies }: { companies: { slug: string; name: string; sector: string; logo_url?: string | null; score: number; news: number }[] }) {
  const [s, set] = useSettings();
  const ctx = companies.filter((c) => s.companies.includes(c.slug));
  return (
    <aside className="min-w-0 space-y-4" aria-label="Context and plugins">
      <Card className="p-4"><h2 className="mb-2 text-sm font-semibold">Company context (1–5)</h2><CompanyPicker compact options={companies} value={s.companies} onChange={(v) => set({ companies: v.slice(0, 5) })} max={5} />
        <ul className="mt-2 space-y-1 text-xs text-muted">{ctx.map((c) => <li key={c.slug} className="flex items-center justify-between gap-2"><span className="inline-flex min-w-0 items-center gap-1.5 truncate"><CompanyLogo name={c.name} src={c.logo_url} size={16} />{c.name}</span><span className="tabular-nums">{fmtScore(c.score)} · {c.news} news</span></li>)}</ul></Card>
      <Card className="p-4"><h2 className="mb-2 text-sm font-semibold">Model &amp; plugin</h2>
        <p className="mb-2 text-xs text-muted" data-testid="sidebar-model">{MODEL_LABEL} · reasoning <code>{REASONING_MODE}</code> · stream</p>
        <ul className="space-y-2" data-testid="sidebar-plugins">{PLUGINS.map((p) => (
          <li key={p.name} className="flex items-start justify-between gap-2 text-sm">
            <div className="min-w-0"><p className="flex flex-wrap items-center gap-1 font-medium">{p.name}{p.status === "builtin" && <Badge tone="muted">built-in context</Badge>}{p.status === "active" && <Badge tone="primary">always on</Badge>}</p>
              <p className="text-[11px] text-muted">{p.purpose}{p.id ? ` · ${p.id}` : ""}</p></div>
            {p.status === "active" && <Switch aria-label={`${p.name} (always on)`} checked disabled />}
          </li>))}</ul>
      </Card>
    </aside>
  );
}
