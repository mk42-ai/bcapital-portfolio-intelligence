"use client";
import { useEffect, useState } from "react";
import { Building2, ListChecks, PanelRightClose, PanelRightOpen, Puzzle } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { PluginPanel } from "./plugin-panel";
import { CompanyPicker } from "./company-picker";
import { Card } from "@/components/ui/card";
import { SignalMini } from "@/components/charts/signal-bullet";
import { CompanyLogo } from "@/components/ui/company-logo";
import { RunRail } from "./run-rail";
import { cn } from "@/lib/utils";

const RAIL_KEY = "bcap.chat.rail";

export function ChatSidebar({ companies, className }: { companies: { slug: string; name: string; sector: string; logo_url?: string | null; score: number; news: number; signal?: number | null; signal_confidence?: number | null; signal_percentile?: number | null }[]; className?: string }) {
  const [s, set] = useSettings();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(window.localStorage.getItem(RAIL_KEY) === "collapsed"); } catch { /* ignore */ } }, []);
  const toggle = () => setCollapsed((c) => { const n = !c; try { window.localStorage.setItem(RAIL_KEY, n ? "collapsed" : "open"); } catch { /* ignore */ } return n; });
  const ctx = companies.filter((c) => s.companies.includes(c.slug));
  const Toggle = collapsed ? PanelRightOpen : PanelRightClose;
  return (
    <aside className={cn("min-w-0 lg:transition-[width]", collapsed ? "lg:w-12" : "lg:w-[300px]", className)} aria-label="Context and plugins" data-testid="chat-rail" data-collapsed={collapsed ? "true" : "false"}>
      {/* Desktop-only collapse toggle; on ≤1024px the rail always renders in full below the thread. */}
      <div className={cn("hidden lg:flex", collapsed ? "justify-center" : "justify-end")}>
        <button type="button" onClick={toggle} data-testid="rail-toggle" aria-expanded={!collapsed} aria-label={collapsed ? "Expand rail" : "Collapse rail"} title={collapsed ? "Expand rail" : "Collapse rail"}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <Toggle className="size-4" aria-hidden />
        </button>
      </div>
      {/* Collapsed 48-px strip (desktop only) */}
      <ul className={cn("mt-1 flex-col items-center gap-1", collapsed ? "hidden lg:flex" : "hidden")} data-testid="rail-strip" aria-label="Rail sections (collapsed)">
        {[{ icon: Building2, label: `Company context (${ctx.length})` }, { icon: Puzzle, label: "Model & plugins" }, { icon: ListChecks, label: "Plan" }].map(({ icon: Icon, label }) => (
          <li key={label}><button type="button" onClick={toggle} title={label} aria-label={label} className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface-1 text-muted hover:bg-surface-2 hover:text-foreground"><Icon className="size-4" aria-hidden /></button></li>
        ))}
      </ul>
      <div className={cn("space-y-3", collapsed ? "lg:hidden" : "")}>
        <RunRail />
        <Card className="p-3"><h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Building2 className="size-3.5 text-muted" aria-hidden /> Company context (1–5)</h2><CompanyPicker compact options={companies} value={s.companies} onChange={(v) => set({ companies: v.slice(0, 5) })} max={5} />
          <ul className="mt-2 space-y-1 text-xs text-muted">{ctx.map((c) => <li key={c.slug} className="flex items-center justify-between gap-2"><span className="inline-flex min-w-0 items-center gap-1.5 truncate"><CompanyLogo name={c.name} src={c.logo_url} size={16} />{c.name}</span><span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">{c.signal != null && <SignalMini score={c.signal} confidence={c.signal_confidence ?? 0} percentile={c.signal_percentile} name={c.name} />}{c.news} news</span></li>)}</ul></Card>
        <Card className="p-3"><h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Puzzle className="size-3.5 text-muted" aria-hidden /> Model &amp; plugins</h2>
          <p className="mb-2 text-xs text-muted" data-testid="sidebar-model">{MODEL_LABEL} · reasoning {REASONING_MODE}</p>
          <PluginPanel variant="rail" testId="sidebar-plugins" />
        </Card>
      </div>
    </aside>
  );
}
