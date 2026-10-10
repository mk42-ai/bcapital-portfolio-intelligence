import Link from "next/link";
import type { Company } from "@/lib/types";
import { fmtUsd, fmtPct, fmtScore, fmtDelta } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { CompanyLogo } from "@/components/ui/company-logo";
import { SignalMini } from "@/components/charts/signal-bullet";
/** Keyboard-accessible tabular alternative to the treemap/heatmap (WCAG 1.1.1 / 2.1.1). */
export type TableRow = Pick<Company, "slug" | "name" | "sector" | "region" | "b_capital_role" | "estimated_ticket_size_usd" | "estimated_ownership_pct" | "estimate_confidence" | "estimate_rationale" | "is_focus"> & { logo_url?: string | null; score: number; delta: number | null; newsCount: number; signal: number | null; signal_confidence: number | null; signal_percentile: number | null };
export type SortKey = "name" | "sector" | "region" | "b_capital_role" | "signal" | "score" | "delta" | "newsCount" | "estimated_ticket_size_usd" | "estimated_ownership_pct" | "estimate_confidence";
export type SortState = { key: SortKey; dir: "asc" | "desc" };
const COLS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "name", label: "Company" }, { key: "sector", label: "Sector" }, { key: "region", label: "Region" }, { key: "b_capital_role", label: "Role" },
  { key: "signal", label: "Signal", right: true }, { key: "delta", label: "Δ", right: true }, { key: "newsCount", label: "News", right: true }, { key: "estimated_ticket_size_usd", label: "Est. ticket", right: true }, { key: "estimated_ownership_pct", label: "Est. own.", right: true }, { key: "estimate_confidence", label: "Confidence" },
];
export function DataTable({ rows, caption, sort, onSort }: { rows: TableRow[]; caption: string; sort?: SortState; onSort?: (key: SortKey) => void }) {
  return (
    <div className="max-h-[520px] overflow-auto rounded-xl border border-border" tabIndex={0} aria-label={caption}>
      <table data-testid="company-table" className="w-full min-w-[840px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase tracking-wide text-muted"><tr>
          {COLS.map((c) => { const active = sort?.key === c.key; const Icon = active ? (sort?.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown; return (
            <th key={c.key} scope="col" aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined} className={`px-3 py-2 ${c.right ? "text-right" : ""}`}>
              {onSort ? <button type="button" data-testid={`sort-${c.key}`} onClick={() => onSort(c.key)} className={`tap inline-flex items-center gap-1 rounded uppercase tracking-wide focus-visible:outline-3 focus-visible:outline-ring ${active ? "text-foreground" : ""}`} aria-label={`Sort by ${c.label}`}>{c.label}<Icon className="size-3.5" aria-hidden /></button> : c.label}
            </th>); })}
        </tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.slug} className="border-t border-border hover:bg-surface-2">
              <th scope="row" className="px-3 py-2 font-medium"><span className="inline-flex items-center gap-2"><CompanyLogo name={c.name} src={c.logo_url} slug={c.slug} size={20} /><Link href={`/company/${c.slug}`} className="underline-offset-2 hover:underline">{c.name}</Link></span>{c.is_focus && <Badge tone="primary" className="ml-2">focus</Badge>}</th>
              <td className="px-3 py-2">{c.sector}</td><td className="px-3 py-2">{c.region}</td><td className="px-3 py-2">{c.b_capital_role}</td>
              <td className="px-3 py-2 text-right tabular-nums"><span className="inline-flex items-center justify-end gap-2">{c.signal != null ? <><SignalMini score={c.signal} confidence={c.signal_confidence ?? 0} percentile={c.signal_percentile} name={c.name} /><span>{Math.round(c.signal)}</span></> : <span className="text-muted" title={`Sentiment ${fmtScore(c.score)} · Signal Score not yet computed`}>—</span>}</span></td><td className="px-3 py-2 text-right tabular-nums">{fmtDelta(c.delta)}</td><td className="px-3 py-2 text-right tabular-nums">{c.newsCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(c.estimated_ticket_size_usd)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtPct(c.estimated_ownership_pct)}</td>
              <td className="px-3 py-2"><Badge tone={c.estimate_confidence === "high" ? "primary" : c.estimate_confidence === "medium" ? "info" : "accent"} title={c.estimate_rationale}>est. · {c.estimate_confidence}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
