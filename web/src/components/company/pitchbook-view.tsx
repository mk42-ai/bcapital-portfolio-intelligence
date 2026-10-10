"use client";
import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Info, Landmark, Loader2, MessageSquarePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";
import type { PbAvailability, PbInvestor, PbSectionKey, PbSourced, PitchbookRecord, PitchbookResponse } from "@/lib/types";
import { addContextChip, chipId, domainOf, setChipTransfer, PITCHBOOK_PLUGIN_ID, PITCHBOOK_PLUGIN_NAME, type ContextChip } from "@/components/chat/open-intelligent-ui/context-chips";

/**
 * Shared PitchBook body (company page card + chat rail). Ground truth baked into the copy: the only PitchBook plugin on the account is
 * plugin-1777018662 "Pitchbook Investor Finder" — investor search only, no credentials. Overview / last round / valuation history / financials /
 * comparables are therefore expected to be NOT_AVAILABLE_FROM_PLUGIN and say so honestly (never a credentials message, never a blank card).
 */
export type PbStatus = "ok" | "offline" | "loading";
export type PbProfileFact = { field: string; value: string; source: string | null; fetched_at: string | null };
/** `source`: where `res` came from — "server" = rendered from server-provided data (no client fetch), "client" = fetched after mount. Exposed as `data-source` on `pb-view`. */
export type PbSource = "server" | "client";
export type PitchbookViewProps = { slug: string; name: string; res: PitchbookResponse | null; status: PbStatus; variant: "page" | "rail"; source?: PbSource; profile?: { overview?: PbProfileFact[]; last_round?: PbProfileFact[] } };

const SECTIONS: { key: PbSectionKey; label: string }[] = [
  { key: "overview", label: "Overview" }, { key: "last_round", label: "Last round" }, { key: "valuation_history", label: "Valuation history" },
  { key: "investors", label: "Investors" }, { key: "financials", label: "Financials" }, { key: "comparables", label: "Comparables" },
];
const UNAVAILABLE_COPY = "Not available from the PitchBook Investor Finder plugin (investor search only)";
const NEXT_PULL_FALLBACK = "Mon 06:00 UTC";

/* ---------- time / freshness helpers ---------- */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—"; const t = new Date(iso).getTime(); if (isNaN(t)) return iso;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now"; const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h ago`; const d = Math.round(h / 24); if (d < 60) return `${d} d ago`;
  const mo = Math.round(d / 30); return mo < 24 ? `${mo} mo ago` : `${Math.round(mo / 12)} y ago`;
}
export function freshness(iso: string | null | undefined, now = Date.now()): "fresh" | "aging" | "stale" | "unknown" {
  if (!iso) return "unknown"; const t = new Date(iso).getTime(); if (isNaN(t)) return "unknown";
  const d = (now - t) / 86_400_000; return d < 7 ? "fresh" : d < 30 ? "aging" : "stale";
}
const DOT: Record<ReturnType<typeof freshness>, string> = { fresh: "bg-[var(--brand-green)]", aging: "bg-amber-400", stale: "bg-gray-300", unknown: "bg-gray-200" };
function nextPull(iso: string | null | undefined): string {
  if (!iso) return NEXT_PULL_FALLBACK; const d = new Date(iso); if (isNaN(+d)) return iso;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${d.toISOString().slice(11, 16)} UTC`;
}
const fmtVal = (v: unknown): string => v == null ? "—" : typeof v === "string" ? v : typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)) : typeof v === "boolean" ? (v ? "yes" : "no") : Array.isArray(v) ? v.map(fmtVal).join(", ") : JSON.stringify(v);
const humanField = (k: string) => k.replace(/_/g, " ");
const availabilityOf = (rec: PitchbookRecord | null | undefined, key: PbSectionKey): PbAvailability | null => rec?.availability?.[key] ?? null;

/* ---------- fact chips ---------- */
type Fact = { field: string; value: string; source: string | null; published: string | null; fetched: string | null; plugin: string | null; availability: string };
function factsFromSourced(prefix: string, s: PbSourced | null | undefined, availability = "AVAILABLE"): Fact[] {
  if (!s || s.value == null) return [];
  const base = { source: s.source_url ?? null, published: s.published_date ?? null, fetched: s.fetched_at ?? null, plugin: s.plugin_id ?? null, availability };
  const v = s.value;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out = Object.entries(v as Record<string, unknown>).filter(([, x]) => x != null && (typeof x !== "object" || Array.isArray(x))).slice(0, 12).map(([k, x]) => ({ field: humanField(k), value: fmtVal(x), ...base }));
    return out.length ? out : [{ field: prefix, value: fmtVal(v), ...base }];
  }
  return [{ field: prefix, value: fmtVal(v), ...base }];
}
const factsFromList = (prefix: string, list: PbSourced[] | null | undefined) => (list ?? []).flatMap((s, i) => {
  const v = s?.value; if (v == null) return [];
  const label = v && typeof v === "object" && !Array.isArray(v) && typeof (v as { label?: unknown }).label === "string" ? String((v as { label: string }).label) : `${prefix} ${i + 1}`;
  return [{ field: label, value: fmtVal(v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => k !== "label")) : v), source: s.source_url ?? null, published: s.published_date ?? null, fetched: s.fetched_at ?? null, plugin: s.plugin_id ?? null, availability: "AVAILABLE" }];
});

function useAsk(variant: "page" | "rail") {
  const router = useRouter();
  return useCallback((chip: ContextChip) => { addContextChip(chip); if (variant === "page") router.push("/chat?skip=1"); }, [router, variant]);
}
const toChip = (company: string, f: Pick<Fact, "field" | "value" | "source" | "fetched" | "plugin">): ContextChip => ({ id: chipId(company, f.field, f.value), company, field: f.field, value: f.value, source: f.source, fetched_at: f.fetched, plugin_id: f.plugin ?? PITCHBOOK_PLUGIN_ID });

function Provenance({ f }: { f: Pick<Fact, "source" | "published" | "fetched" | "plugin"> }) {
  // Relative times are client-only (a server-computed "41 min ago" differs from the client's → React hydration #418): render them after mount.
  const [now, setNow] = useState(0); useEffect(() => { setNow(Date.now()); }, []);
  const dom = domainOf(f.source); const fr = now ? freshness(f.fetched, now) : "unknown";
  const rel = (iso: string | null | undefined) => (now ? relTime(iso, now) : iso ? iso.slice(0, 10) : "—");
  const title = [dom ? `source ${dom}` : null, f.published ? `published ${f.published}` : null, f.fetched ? `fetched ${rel(f.fetched)}` : null, f.plugin ?? null].filter(Boolean).join(" · ") || "no provenance";
  return (
    <details className="relative inline-flex" title={title} data-testid="pb-provenance" onClick={(e) => e.stopPropagation()}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-0.5 text-muted hover:text-foreground [&::-webkit-details-marker]:hidden" aria-label={`Provenance: ${title}`}>
        <span className={cn("inline-block size-1.5 rounded-full", DOT[fr])} data-freshness={fr} aria-hidden /><Info className="size-3" aria-hidden />
      </summary>
      <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-surface p-2 text-left text-[11px] leading-snug shadow-md">
        <p><span className="text-muted">source</span> · {dom ? (f.source ? <a href={f.source} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{dom}</a> : dom) : "—"}</p>
        <p><span className="text-muted">published</span> · {f.published ?? "—"}</p>
        <p><span className="text-muted">fetched</span> · {rel(f.fetched)}{f.fetched ? <time dateTime={f.fetched} className="ml-1 text-muted">({f.fetched.slice(0, 10)})</time> : null}</p>
        <p className="text-muted">{f.plugin ?? PITCHBOOK_PLUGIN_NAME}</p>
      </div>
    </details>
  );
}

function FactChip({ company, f, onAsk, compact }: { company: string; f: Fact; onAsk: (c: ContextChip) => void; compact?: boolean }) {
  const chip = toChip(company, f);
  const key = (e: KeyboardEvent<HTMLDivElement>) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAsk(chip); } };
  return (
    <div tabIndex={0} role="group" aria-label={`${f.field}: ${f.value}. Press Enter to ask in chat.`} data-testid="pb-chip" data-field={f.field} data-availability={f.availability}
      draggable onDragStart={(e) => setChipTransfer(e.dataTransfer, chip)} onKeyDown={key}
      className={cn("inline-flex max-w-full cursor-grab items-center gap-1.5 rounded-md border border-border bg-surface-2 py-1 pl-2 pr-1 text-xs focus-visible:outline-2 focus-visible:outline-[var(--brand-green-ink)] active:cursor-grabbing", compact && "text-[11px]")}>
      <span className="text-muted">{f.field}</span>
      <span className="truncate font-medium tabular-nums" title={f.value}>{f.value}</span>
      <Provenance f={f} />
      <button type="button" onClick={() => onAsk(chip)} data-testid="pb-ask" aria-label={`Ask in chat about ${f.field}`} title="Ask in chat" tabIndex={-1}
        className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-[var(--brand-green-soft)] hover:text-[var(--brand-green-ink)]"><MessageSquarePlus className="size-3.5" aria-hidden /></button>
    </div>
  );
}

/* ---------- investors ---------- */
const musd = (n: number | null | undefined) => n == null ? null : fmtUsd(n * 1e6);
function InvestorRow({ company, inv, onAsk, compact }: { company: string; inv: PbInvestor; onAsk: (c: ContextChip) => void; compact?: boolean }) {
  const money = [inv.aum_musd != null ? `AUM ${musd(inv.aum_musd)}` : null, inv.dry_powder_musd != null ? `dry powder ${musd(inv.dry_powder_musd)}` : null].filter(Boolean).join(" · ");
  const verts = (inv.verticals ?? inv.industries ?? []).slice(0, 3);
  const summary = [inv.type, inv.location, money, inv.investment_range ? `ticket ${inv.investment_range}` : null, verts.length ? verts.join(", ") : null].filter(Boolean).join(" · ");
  const chip: ContextChip = { id: chipId(company, "investor", inv.name), company, field: "investor", value: `${inv.name}${summary ? ` (${summary})` : ""}`, source: inv.website ?? null, fetched_at: null, plugin_id: PITCHBOOK_PLUGIN_ID };
  const key = (e: KeyboardEvent<HTMLLIElement>) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAsk(chip); } };
  return (
    <li tabIndex={0} data-testid="pb-investor" data-name={inv.name} draggable onDragStart={(e) => setChipTransfer(e.dataTransfer, chip)} onKeyDown={key} aria-label={`${inv.name}. Press Enter to ask in chat.`}
      className={cn("group flex cursor-grab items-start justify-between gap-2 rounded-md border border-transparent px-1.5 py-1 hover:border-border hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-[var(--brand-green-ink)]", compact ? "text-[11px]" : "text-xs")}>
      <div className="min-w-0">
        <p className="flex items-center gap-1 font-medium">
          {inv.website ? <a href={inv.website} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-2 hover:underline">{inv.name}</a> : <span className="truncate">{inv.name}</span>}
          {inv.website && <ExternalLink className="size-3 shrink-0 text-muted" aria-hidden />}
          {inv.status && inv.status.toLowerCase() !== "active" && <Badge tone="muted" className="ml-1 min-h-4 px-1.5 py-0 text-[10px]">{inv.status}</Badge>}
        </p>
        <p className="text-muted">{[inv.type, inv.location].filter(Boolean).join(" · ") || "—"}</p>
        {(money || inv.investment_range) && <p className="tabular-nums text-muted">{[money, inv.investment_range ? `ticket ${inv.investment_range}` : null].filter(Boolean).join(" · ")}</p>}
        {verts.length > 0 && <p className="flex flex-wrap gap-1 pt-0.5">{verts.map((v) => <span key={v} className="rounded-full border border-border bg-surface px-1.5 text-[10px]">{v}</span>)}</p>}
      </div>
      <button type="button" onClick={() => onAsk(chip)} data-testid="pb-ask" aria-label={`Ask in chat about ${inv.name}`} title="Ask in chat" tabIndex={-1}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-[var(--brand-green-soft)] hover:text-[var(--brand-green-ink)]"><MessageSquarePlus className="size-3.5" aria-hidden /></button>
    </li>
  );
}
function Investors({ company, rec, onAsk, compact }: { company: string; rec: PitchbookRecord; onAsk: (c: ContextChip) => void; compact?: boolean }) {
  const [all, setAll] = useState(false);
  const matched = rec.investors?.matched ?? []; const limit = compact ? 3 : 5;
  const shown = all ? matched : matched.slice(0, limit); const total = rec.investors?.total_reported ?? matched.length;
  if (!matched.length) return <Unavailable text={availabilityOf(rec, "investors") === "NOT_AVAILABLE_FROM_PLUGIN" ? UNAVAILABLE_COPY : "No investor matches returned yet."} />;
  return (
    <div>
      {rec.investors?.brief && <p className={cn("mb-1.5 text-muted", compact ? "text-[11px]" : "text-xs")} data-testid="pb-investors-brief">{rec.investors.brief}</p>}
      <ul className="space-y-0.5" data-testid="pb-investors">{shown.map((inv, i) => <InvestorRow key={`${inv.name}-${i}`} company={company} inv={inv} onAsk={onAsk} compact={compact} />)}</ul>
      {matched.length > limit && <button type="button" onClick={() => setAll((v) => !v)} data-testid="pb-investors-more" aria-expanded={all} className="mt-1 text-xs font-medium text-[var(--brand-green-ink)] underline-offset-2 hover:underline">{all ? "Show fewer" : `Show all ${total}`}</button>}
      {total > matched.length && all && <p className="mt-1 text-[11px] text-muted">{total.toLocaleString()} reported by the plugin · {matched.length} returned in this pull.</p>}
    </div>
  );
}

/* ---------- honest states ---------- */
const Unavailable = ({ text = UNAVAILABLE_COPY }: { text?: string }) => <p className="text-xs text-muted" data-testid="pb-unavailable">{text}</p>;

function EmptyPb({ slug, name, nextRun, onAsk, compact }: { slug: string; name: string; nextRun: string; onAsk: (c: ContextChip) => void; compact?: boolean }) {
  const chip: ContextChip = { id: chipId(slug, "question", "investors"), company: name, field: "question", value: `Which investors in PitchBook match ${name}'s stage, sector and geography?`, source: null, fetched_at: null, plugin_id: PITCHBOOK_PLUGIN_ID };
  return (
    <div className={cn("flex items-center gap-3 rounded-md border border-dashed border-border bg-surface-2/60 p-3", compact && "flex-col text-center")} data-testid="pb-empty" role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/fallbacks/ledger-empty.webp" width={96} height={96} alt="" decoding="async" loading="lazy" className="size-24 shrink-0 object-contain" />
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm font-medium">No PitchBook data yet · next pull {nextRun}</p>
        <p className="text-xs text-muted">The weekly pull asks the {PITCHBOOK_PLUGIN_NAME} plugin for investor matches; it does not provide company financials.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onAsk(chip)} data-testid="pb-ask-investors" className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium hover:bg-[var(--brand-green-soft)] hover:text-[var(--brand-green-ink)]"><MessageSquarePlus className="size-3.5" aria-hidden /> Ask about investors</button></div>
      </div>
    </div>
  );
}

/* ---------- main view ---------- */
export function PitchbookView({ slug, name, res, status, variant, source = "server", profile }: PitchbookViewProps) {
  const compact = variant === "rail"; const onAsk = useAsk(variant);
  const [now, setNow] = useState(0); useEffect(() => { setNow(Date.now()); }, [res]);
  if (status === "loading") return <p className="text-xs text-muted" data-testid="pb-loading"><Loader2 className="mr-1 inline size-3 oiu-spin" aria-hidden /> Loading PitchBook…</p>;
  if (status === "offline" || !res) return <p className="text-xs text-muted" data-testid="pb-offline" role="status">PitchBook panel offline — the portfolio backend did not answer <code>/pitchbook/{slug}</code>.</p>;
  if (res.state === "NEEDS_CREDENTIALS") return <p className="text-xs text-danger" data-testid="pb-needs-creds" role="status">PitchBook plugin needs credentials: {(res.fields ?? []).join(", ") || "unspecified"}</p>;
  const nextRun = nextPull(res.next_run_utc); const rec = res.data;
  if (!rec) return <EmptyPb slug={slug} name={res.name ?? name} nextRun={nextRun} onAsk={onAsk} compact={compact} />;
  const company = res.name ?? name; const fetched = rec.provenance?.fetched_at ?? null; const fr = freshness(fetched, now || undefined);
  const section = (key: PbSectionKey): ReactNode => {
    const av = availabilityOf(rec, key);
    const fallback = key === "overview" ? profile?.overview : key === "last_round" ? profile?.last_round : undefined;
    let facts: Fact[] = [];
    if (key === "investors") return <Investors company={company} rec={rec} onAsk={onAsk} compact={compact} />;
    if (key === "overview") facts = factsFromSourced("overview", rec.overview); else if (key === "last_round") facts = factsFromSourced("last round", rec.last_round);
    else if (key === "financials") facts = factsFromSourced("financials", rec.financials); else if (key === "valuation_history") facts = factsFromList("valuation", rec.valuation_history); else facts = factsFromList("comparable", rec.comparables);
    if (facts.length) return <div className="flex flex-wrap gap-1.5">{facts.map((f, i) => <FactChip key={`${f.field}-${i}`} company={company} f={f} onAsk={onAsk} compact={compact} />)}</div>;
    return (
      <div className="space-y-1.5">
        <Unavailable text={av && av !== "NOT_AVAILABLE_FROM_PLUGIN" ? `No ${key.replace(/_/g, " ")} in this pull (${String(av).toLowerCase()}).` : UNAVAILABLE_COPY} />
        {fallback && fallback.length > 0 && <div className="flex flex-wrap gap-1.5" data-testid="pb-profile-fallback"><span className="self-center text-[10px] uppercase tracking-wide text-muted">portfolio profile</span>{fallback.map((p, i) => <FactChip key={`${p.field}-${i}`} company={company} f={{ ...p, published: null, fetched: p.fetched_at, plugin: null, availability: "PROFILE" }} onAsk={onAsk} compact={compact} />)}</div>}
      </div>
    );
  };
  return (
    <div className={cn("space-y-3", compact && "space-y-2")} data-testid="pb-view" data-source={source} data-enriched={res.enriched ? "true" : "false"}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted" data-testid="pb-header">
          <Landmark className="size-3.5 shrink-0" aria-hidden /><span className="font-medium text-foreground">{PITCHBOOK_PLUGIN_NAME}</span>
          <span className={cn("inline-block size-1.5 rounded-full", DOT[fr])} aria-hidden title={`fetched ${fetched ?? "—"}`} />
          <span className="truncate">Updated {now ? relTime(fetched, now) : fetched ? fetched.slice(0, 10) : "—"} · next pull {nextRun}</span>
        </p>
      </header>
      {SECTIONS.filter((s) => !compact || s.key === "investors" || s.key === "overview" || s.key === "last_round").map((s) => (
        <section key={s.key} data-testid={`pb-section-${s.key}`} data-availability={availabilityOf(rec, s.key) ?? "UNKNOWN"} aria-label={s.label}>
          <h3 className={cn("mb-1 font-semibold", compact ? "text-[11px]" : "text-xs")}>{s.label}</h3>
          {section(s.key)}
        </section>
      ))}
      {compact && <p className="text-[10px] text-muted">Valuation history · financials · comparables: {UNAVAILABLE_COPY.toLowerCase()}.</p>}
    </div>
  );
}
