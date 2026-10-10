"use client";
import { useSettings } from "@/lib/settings";
import { MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { PluginPanel } from "./plugin-panel";
import { CompanyPicker } from "./company-picker";
import { Card } from "@/components/ui/card";
import { fmtScore } from "@/lib/format";
import { CompanyLogo } from "@/components/ui/company-logo";
import { WhyInteractive } from "./why-interactive";
import { RunRail } from "./run-rail";
export function ChatSidebar({ companies }: { companies: { slug: string; name: string; sector: string; logo_url?: string | null; score: number; news: number }[] }) {
  const [s, set] = useSettings();
  const ctx = companies.filter((c) => s.companies.includes(c.slug));
  return (
    <aside className="min-w-0 space-y-4" aria-label="Context and plugins">
      <Card className="p-4"><h2 className="mb-2 text-sm font-semibold">Company context (1–5)</h2><CompanyPicker compact options={companies} value={s.companies} onChange={(v) => set({ companies: v.slice(0, 5) })} max={5} />
        <ul className="mt-2 space-y-1 text-xs text-muted">{ctx.map((c) => <li key={c.slug} className="flex items-center justify-between gap-2"><span className="inline-flex min-w-0 items-center gap-1.5 truncate"><CompanyLogo name={c.name} src={c.logo_url} size={16} />{c.name}</span><span className="tabular-nums">{fmtScore(c.score)} · {c.news} news</span></li>)}</ul></Card>
      <Card className="p-4"><h2 className="mb-2 text-sm font-semibold">Model &amp; plugins</h2>
        <p className="mb-2 text-xs text-muted" data-testid="sidebar-model">{MODEL_LABEL} · reasoning <code>{REASONING_MODE}</code> · stream</p>
        <PluginPanel variant="rail" testId="sidebar-plugins" />
      </Card>
      <RunRail />
      <WhyInteractive />
    </aside>
  );
}
