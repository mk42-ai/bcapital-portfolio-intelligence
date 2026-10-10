"use client";
import { useCallback, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Info, Landmark, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";
import type { PbFactKey, PbSnapshotEntry, PbSnapshotField, PbSnapshotInvestor } from "@/lib/pitchbook-snapshot-types";
import { composerStore } from "@/components/chat/open-intelligent-ui/composer-store";
import { addContextChip, chipId, domainOf, setChipTransfer, PITCHBOOK_PLUGIN_ID, PITCHBOOK_PLUGIN_NAME, type ContextChip } from "@/components/chat/open-intelligent-ui/context-chips";

/**
 * PitchBook facts — shared by the company page card (variant "page") and the chat inspector drawer (variant "drawer").
 * Renders ENTIRELY from the committed snapshot entry passed in as a prop: no fetch, no loading state, no run button, no job ids.
 * Every date is a static yyyy-mm-dd string from the snapshot (no Date.now() / relative time → hydration-safe).
 * "Ask in chat" never creates a thread: it queues a context chip + appends a question to the composer draft, then (on a company page)
 * navigates to /chat?skip=1 where the draft is waiting in the existing composer.
 */
export type PitchbookFactsProps = { entry: PbSnapshotEntry | null; slug: string; name: string; variant: "page" | "drawer"; onAsk?: (chip: ContextChip) => void };

const NEXT_PULL_FALLBACK = "Mon 06:00 UTC";
const UNAVAILABLE_COPY = "Valuation history, financials and comparables are not available from the Investor Finder plugin (investor search only).";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FACTS: { key: PbFactKey; label: string }[] = [
  { key: "name", label: "Name" }, { key: "hq", label: "HQ" }, { key: "industry", label: "Industry" },
  { key: "employees", label: "Employees" }, { key: "founded", label: "Founded" }, { key: "last_deal", label: "Last deal" },
];

/* ---------- static date helpers (deterministic on server and client) ---------- */
export const ymd = (iso: string | null | undefined): string | null => { if (!iso) return null; const d = new Date(iso); return isNaN(+d) ? iso.slice(0, 10) : d.toISOString().slice(0, 10); };
export function nextPull(iso: string | null | undefined): string {
  if (!iso) return NEXT_PULL_FALLBACK; const d = new Date(iso); if (isNaN(+d)) return iso;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.toISOString().slice(11, 16)} UTC`;
}
const musd = (n: number | null | undefined) => (n == null ? null : fmtUsd(n * 1e6));

/* ---------- ask-in-chat plumbing ---------- */
function useAskInChat(variant: "page" | "drawer", onAsk?: (chip: ContextChip) => void) {
  const router = useRouter();
  return useCallback((chip: ContextChip, question: string) => {
    addContextChip(chip);
    composerStore.append(question);
    onAsk?.(chip);
    if (variant === "page") router.push("/chat?skip=1");
  }, [router, variant, onAsk]);
}
const factChip = (company: string, field: string, f: PbSnapshotField): ContextChip => ({ id: chipId(company, field, f.value), company, field, value: f.value, source: f.source ?? null, fetched_at: f.fetched_at ?? null, plugin_id: f.plugin ?? PITCHBOOK_PLUGIN_ID });
const factQuestion = (company: string, label: string, f: PbSnapshotField | null) => f ? `What do we know about ${company}'s ${label} (${f.value})?` : `What is ${company}'s ${label}? It is not in our PitchBook snapshot yet.`;

function Provenance({ source, fetched_at, plugin }: { source: string | null | undefined; fetched_at: string | null | undefined; plugin: string | null | undefined }) {
  const dom = domainOf(source); const date = ymd(fetched_at);
  const title = [dom ? `source ${dom}` : null, date ? `fetched ${date}` : null, plugin ?? PITCHBOOK_PLUGIN_NAME].filter(Boolean).join(" · ");
  return (
    <details className="relative inline-flex" data-testid="pb-provenance" title={title} onClick={(e) => e.stopPropagation()}>
      <summary className="inline-flex cursor-pointer list-none items-center rounded px-0.5 text-muted hover:text-foreground [&::-webkit-details-marker]:hidden" aria-label={`Provenance: ${title}`}><Info className="size-3" aria-hidden /></summary>
      <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-surface p-2 text-left text-[11px] leading-snug shadow-md">
        <p><span className="text-muted">source</span> · {dom ? (source ? <a href={source} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{dom}</a> : dom) : "—"}</p>
        <p><span className="text-muted">fetched</span> · {date ? <time dateTime={fetched_at ?? undefined}>{date}</time> : "—"}</p>
        <p className="text-muted">{plugin ?? PITCHBOOK_PLUGIN_NAME}</p>
      </div>
    </details>
  );
}

/* ---------- fact row ---------- */
function FactRow({ company, label, field, f, compact, ask }: { company: string; label: string; field: PbFactKey; f: PbSnapshotField | null; compact: boolean; ask: (chip: ContextChip, q: string) => void }) {
  const chip: ContextChip = f ? factChip(company, label, f) : { id: chipId(company, label, "unknown"), company, field: label, value: "unknown", source: null, fetched_at: null, plugin_id: PITCHBOOK_PLUGIN_ID };
  const q = factQuestion(company, label, f);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ask(chip, q); } };
  return (
    <div role="row" tabIndex={0} data-testid="pb-field" data-field={field} data-availability={f ? "known" : "unknown"} aria-label={`${label}: ${f?.value ?? "unknown"}. Press Enter to ask in chat.`}
      onKeyDown={onKey} draggable={!!f} onDragStart={f ? (e) => setChipTransfer(e.dataTransfer, chip) : undefined}
      className={cn("group grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-start gap-x-2 rounded-md border border-transparent px-1.5 py-1 hover:border-border hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-[var(--brand-green-ink)]", compact ? "grid-cols-[5.5rem_minmax(0,1fr)_auto] text-[11px]" : "text-xs")}>
      <dt role="cell" className="pt-px text-muted">{label}</dt>
      <dd role="cell" className="flex min-w-0 items-start gap-1">
        <span data-testid="pb-value" className={cn("min-w-0 break-words font-medium tabular-nums", !f && "font-normal text-muted")} title={f?.value}>{f?.value ?? "—"}</span>
        {f && <Provenance source={f.source} fetched_at={f.fetched_at} plugin={f.plugin} />}
      </dd>
      <dd role="cell" className="flex items-center">
        <button type="button" onClick={() => ask(chip, q)} data-testid="pb-ask" aria-label={`Ask in chat about ${label}`} title="Ask in chat" tabIndex={-1}
          className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-[var(--brand-green-soft)] hover:text-[var(--brand-green-ink)]"><MessageSquarePlus className="size-3.5" aria-hidden /></button>
      </dd>
    </div>
  );
}

/* ---------- investors ---------- */
function InvestorRow({ company, inv, fetched_at, compact, ask }: { company: string; inv: PbSnapshotInvestor; fetched_at: string | null; compact: boolean; ask: (chip: ContextChip, q: string) => void }) {
  const summary = [inv.type, inv.location, inv.aum_musd != null ? `AUM ${musd(inv.aum_musd)}` : null].filter(Boolean).join(" · ");
  const chip: ContextChip = { id: chipId(company, "investor", inv.name), company, field: "investor", value: `${inv.name}${summary ? ` (${summary})` : ""}`, source: inv.website ?? null, fetched_at, plugin_id: PITCHBOOK_PLUGIN_ID };
  const q = `Tell me more about ${inv.name} as a potential co-investor for ${company}.`;
  const onKey = (e: KeyboardEvent<HTMLLIElement>) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ask(chip, q); } };
  return (
    <li tabIndex={0} data-testid="pb-investor" data-name={inv.name} draggable onDragStart={(e) => setChipTransfer(e.dataTransfer, chip)} onKeyDown={onKey} aria-label={`${inv.name}. Press Enter to ask in chat.`}
      className={cn("group flex cursor-grab items-start justify-between gap-2 rounded-md border border-transparent px-1.5 py-1 hover:border-border hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-[var(--brand-green-ink)]", compact ? "text-[11px]" : "text-xs")}>
      <div className="min-w-0">
        <div className="flex items-center gap-1 font-medium">
          {inv.website ? <a href={inv.website} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-2 hover:underline">{inv.name}</a> : <span className="truncate">{inv.name}</span>}
          {inv.website && <ExternalLink className="size-3 shrink-0 text-muted" aria-hidden />}
          <Provenance source={inv.website} fetched_at={fetched_at} plugin={PITCHBOOK_PLUGIN_ID} />
        </div>
        <p className="text-muted">{summary || "—"}</p>
      </div>
      <button type="button" onClick={() => ask(chip, q)} data-testid="pb-ask" aria-label={`Ask in chat about ${inv.name}`} title="Ask in chat" tabIndex={-1}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-[var(--brand-green-soft)] hover:text-[var(--brand-green-ink)]"><MessageSquarePlus className="size-3.5" aria-hidden /></button>
    </li>
  );
}
function Investors({ company, entry, compact, ask }: { company: string; entry: PbSnapshotEntry; compact: boolean; ask: (chip: ContextChip, q: string) => void }) {
  const [all, setAll] = useState(false);
  const list = entry.investors ?? []; const limit = compact ? 3 : 4; const shown = all ? list : list.slice(0, limit);
  const total = entry.investors_total ?? list.length;
  return (
    <section aria-label="Investors" data-testid="pb-investors-section">
      <h3 className={cn("mb-1 font-semibold", compact ? "text-[11px]" : "text-xs")}>Investor matches{total ? <span className="ml-1 font-normal text-muted">· {total.toLocaleString("en-US")} reported</span> : null}</h3>
      {entry.investors_brief && !compact && <p className="mb-1.5 whitespace-pre-line text-[11px] text-muted" data-testid="pb-investors-brief">{entry.investors_brief}</p>}
      {list.length ? (
        <>
          <ul className="space-y-0.5" data-testid="pb-investors">{shown.map((inv, i) => <InvestorRow key={`${inv.name}-${i}`} company={company} inv={inv} fetched_at={entry.fetched_at} compact={compact} ask={ask} />)}</ul>
          {list.length > limit && <button type="button" onClick={() => setAll((v) => !v)} data-testid="pb-investors-more" aria-expanded={all} className="mt-1 text-xs font-medium text-[var(--brand-green-ink)] underline-offset-2 hover:underline">{all ? "Show fewer" : `Show all ${list.length}`}</button>}
          {all && total > list.length && <p className="mt-1 text-[11px] text-muted">{total.toLocaleString("en-US")} reported by the plugin · {list.length} kept in the snapshot.</p>}
        </>
      ) : <p className="text-xs text-muted" data-testid="pb-investors-none">No investor matches in this snapshot.</p>}
    </section>
  );
}

/* ---------- empty state ---------- */
function EmptyPb({ name, compact, ask }: { name: string; compact: boolean; ask: (chip: ContextChip, q: string) => void }) {
  const q = `Which investors in PitchBook match ${name}'s stage, sector and geography?`;
  const chip: ContextChip = { id: chipId(name, "question", "investors"), company: name, field: "question", value: q, source: null, fetched_at: null, plugin_id: PITCHBOOK_PLUGIN_ID };
  return (
    <div className={cn("space-y-1.5 rounded-md border border-dashed border-border bg-surface-2/60 p-3", compact && "text-center")} data-testid="pb-empty" role="status">
      <p className="text-sm font-medium">No PitchBook snapshot for {name} yet · next pull {NEXT_PULL_FALLBACK}</p>
      <p className="text-xs text-muted">The weekly pull asks the {PITCHBOOK_PLUGIN_NAME} plugin for investor matches; it does not provide company financials.</p>
      <button type="button" onClick={() => ask(chip, q)} data-testid="pb-ask-investors" className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium hover:bg-[var(--brand-green-soft)] hover:text-[var(--brand-green-ink)]"><MessageSquarePlus className="size-3.5" aria-hidden /> Ask about investors</button>
    </div>
  );
}

/* ---------- main ---------- */
export function PitchbookFacts({ entry, slug, name, variant, onAsk }: PitchbookFactsProps) {
  const compact = variant === "drawer"; const ask = useAskInChat(variant, onAsk);
  if (!entry) return <EmptyPb name={name} compact={compact} ask={ask} />;
  const company = entry.name || name;
  const facts: Record<PbFactKey, PbSnapshotField | null> = {
    name: { value: company, source: null, fetched_at: entry.fetched_at, plugin: PITCHBOOK_PLUGIN_ID },
    hq: entry.hq, industry: entry.industry, employees: entry.employees, founded: entry.founded, last_deal: entry.last_deal,
  };
  return (
    <div className={cn("space-y-3", compact && "space-y-2")} data-testid="pb-view" data-slug={slug} data-variant={variant}>
      <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted" data-testid="pb-header">
        <Landmark className="size-3.5 shrink-0" aria-hidden /><span className="font-medium text-foreground">{PITCHBOOK_PLUGIN_NAME}</span>
        <span>· snapshot <time dateTime={entry.fetched_at ?? undefined}>{ymd(entry.fetched_at) ?? "—"}</time></span>
        <span>· next pull {nextPull(entry.next_run_utc)}</span>
      </p>
      <dl role="table" aria-label="PitchBook facts" data-testid="pb-facts" className="space-y-0.5">
        {FACTS.map(({ key, label }) => <FactRow key={key} company={company} label={label} field={key} f={facts[key]} compact={compact} ask={ask} />)}
      </dl>
      <Investors company={company} entry={entry} compact={compact} ask={ask} />
      <p className={cn("text-muted", compact ? "text-[10px]" : "text-[11px]")} data-testid="pb-unavailable">{UNAVAILABLE_COPY}</p>
    </div>
  );
}
