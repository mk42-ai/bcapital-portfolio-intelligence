"use client";
/**
 * Inspector drawer — opened from the chat top bar (data-testid=inspector-toggle). Holds everything that used to live in the right rail:
 * This run (model · plugins · plan · agent events), PitchBook snapshot for the first context company, Company context picker, Model & plugins.
 * Telemetry (first event / first token / tokens / stream integrity) AND the raw SSE request frame sit behind ONE reveal (<details data-testid=dev-disclosure>).
 * It is a right-side overlay on desktop (420 px) and a bottom sheet on mobile; it never changes the thread's width or scroll position.
 */
import { useEffect, type ReactNode } from "react";
import { Building2, Landmark, ListChecks, Puzzle, SlidersHorizontal, X } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { MODEL_LABEL, REASONING_MODE } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import { CompanyPicker } from "./company-picker";
import { PluginPanel } from "./plugin-panel";
import { RunRail } from "./run-rail";
import { PitchbookDrawerSection } from "./pitchbook-rail";
import { SignalMini } from "@/components/charts/signal-bullet";
import { CompanyLogo } from "@/components/ui/company-logo";
import { inspectorStore, useInspectorOpen } from "@/components/chat/open-intelligent-ui/composer-store";
import type { PbSnapshot } from "@/lib/pitchbook-snapshot-types";
import pbSnapshotJson from "@/data/pitchbook-snapshot.json";

/** Committed PitchBook snapshot (built by scripts/build-pitchbook-snapshot.mjs) — bundled, so the drawer paints with NO network request. */
const PB_ENTRIES = (pbSnapshotJson as unknown as PbSnapshot).companies;

export type InspectorCompany = { slug: string; name: string; sector: string; logo_url?: string | null; score: number; news: number; signal?: number | null; signal_confidence?: number | null; signal_percentile?: number | null };

export function InspectorToggle({ className }: { className?: string }) {
  const open = useInspectorOpen();
  return (
    <button type="button" onClick={() => inspectorStore.toggle()} data-testid="inspector-toggle" aria-expanded={open} aria-controls="chat-inspector" aria-label={open ? "Close inspector" : "Open inspector"} title="Inspector — run plan, PitchBook, context, plugins"
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring", open && "bg-surface-3", className)}>
      <SlidersHorizontal className="size-3.5" aria-hidden /><span className="hidden sm:inline">Inspector</span>
    </button>
  );
}

function Section({ icon: Icon, title, children, testId }: { icon: typeof Building2; title: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-3" data-testid={testId}>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Icon className="size-3.5 text-muted" aria-hidden /> {title}</h2>
      {children}
    </section>
  );
}

export function InspectorDrawer({ companies }: { companies: InspectorCompany[] }) {
  const open = useInspectorOpen();
  const [s, set] = useSettings();
  const ctx = companies.filter((c) => s.companies.includes(c.slug));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") inspectorStore.set(false); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      {open && <button type="button" aria-label="Close inspector" className="fixed inset-0 z-[60] bg-black/20 lg:bg-transparent" data-testid="inspector-backdrop" onClick={() => inspectorStore.set(false)} />}
      <aside id="chat-inspector" data-testid="chat-inspector" data-open={open ? "true" : "false"} aria-label="Inspector" inert={!open || undefined}
        className={cn("fixed z-[70] flex flex-col border-border bg-background shadow-xl transition-transform duration-200 ease-out",
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t", "lg:inset-y-0 lg:left-auto lg:right-0 lg:h-dvh lg:w-[420px] lg:max-h-none lg:rounded-none lg:border-l lg:border-t-0",
          open ? "translate-y-0 lg:translate-x-0" : "pointer-events-none translate-y-full lg:translate-x-full lg:translate-y-0")}>
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Inspector</h2>
          <button type="button" onClick={() => inspectorStore.set(false)} data-testid="inspector-close" aria-label="Close inspector" className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"><X className="size-4" aria-hidden /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-testid="inspector-body">
          <RunRail />
          <Section icon={Landmark} title="PitchBook" testId="inspector-pitchbook"><PitchbookDrawerSection companies={companies} entries={PB_ENTRIES} /></Section>
          <Section icon={Building2} title="Company context (1–5)" testId="inspector-context">
            <CompanyPicker compact options={companies} value={s.companies} onChange={(v) => set({ companies: v.slice(0, 5) })} max={5} />
            <ul className="mt-2 space-y-1 text-xs text-muted">{ctx.map((c) => <li key={c.slug} className="flex items-center justify-between gap-2"><span className="inline-flex min-w-0 items-center gap-1.5 truncate"><CompanyLogo name={c.name} src={c.logo_url} size={16} />{c.name}</span><span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">{c.signal != null && <SignalMini score={c.signal} confidence={c.signal_confidence ?? 0} percentile={c.signal_percentile} name={c.name} />}{c.news} news</span></li>)}</ul>
          </Section>
          <Section icon={Puzzle} title="Model & plugins" testId="inspector-plugins">
            <p className="mb-2 text-xs text-muted" data-testid="sidebar-model">{MODEL_LABEL} · reasoning {REASONING_MODE}</p>
            <PluginPanel variant="rail" testId="sidebar-plugins" />
          </Section>
          <p className="flex items-center gap-1 text-[11px] text-muted"><ListChecks className="size-3" aria-hidden /> Plan, telemetry and the raw SSE frame are inside “This run”.</p>
        </div>
      </aside>
    </>
  );
}
