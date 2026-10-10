"use client";
import { useSettings } from "@/lib/settings";
import { PLUGINS, EARLIEST_TEST_UTC } from "@/lib/plugins";
import { CompanyPicker } from "./company-picker";
import { Countdown } from "./countdown";
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
      <Card className="p-4"><h2 className="mb-2 text-sm font-semibold">Plugins</h2>
        <ul className="space-y-2">{PLUGINS.map((p) => (
          <li key={p.name} className="flex items-start justify-between gap-2 text-sm">
            <div className="min-w-0"><p className="flex flex-wrap items-center gap-1 font-medium">{p.name}{p.status === "builtin" && <Badge tone="muted">built-in context</Badge>}{p.status === "deferred" && <Badge tone="muted">configuring — deferred</Badge>}{p.status === "dropped" && <Badge tone="muted">dropped — tool 404</Badge>}</p>
              {p.status === "deferred" && <p className="text-[11px] text-muted">available after <Countdown iso={EARLIEST_TEST_UTC} /> once the owner confirms</p>}{p.status === "builtin" && <p className="text-[11px] text-muted" title="The OnDemand public API has no plugin-registration endpoint, so the portfolio API is not an OnDemand plugin. Live backend sentiment, status and headlines for your context companies are injected into the first message of each thread instead. Details: docs/ONDEMAND_SURFACE.md">always on — API has no public plugin-registration endpoint (<a className="underline" href="https://github.com/mk42-ai/bcapital-portfolio-intelligence/blob/main/docs/ONDEMAND_SURFACE.md" target="_blank" rel="noreferrer">docs/ONDEMAND_SURFACE.md</a>)</p>}</div>
            {p.status !== "builtin" && <Switch aria-label={`Use ${p.name}`} checked={!!p.id && !!s.plugins[p.id] && p.status === "active"} disabled={!p.id || p.status !== "active"} onCheckedChange={(v) => p.id && set({ plugins: { ...s.plugins, [p.id]: v } })} />}
          </li>))}</ul>
      </Card>
    </aside>
  );
}
