import Link from "next/link";
import type { Company } from "@/lib/types";
import { fmtUsd, fmtPct, fmtScore, fmtDelta } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
/** Keyboard-accessible tabular alternative to the treemap/heatmap (WCAG 1.1.1 / 2.1.1). */
export type TableRow = Pick<Company, "slug" | "name" | "sector" | "region" | "b_capital_role" | "estimated_ticket_size_usd" | "estimated_ownership_pct" | "estimate_confidence" | "estimate_rationale" | "is_focus"> & { score: number; delta: number | null; newsCount: number };
export function DataTable({ rows, caption }: { rows: TableRow[]; caption: string }) {
  return (
    <div className="max-h-[520px] overflow-auto rounded-xl border border-border" tabIndex={0} aria-label={caption}>
      <table className="w-full min-w-[840px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase tracking-wide text-muted"><tr>
          <th scope="col" className="px-3 py-2">Company</th><th scope="col" className="px-3 py-2">Sector</th><th scope="col" className="px-3 py-2">Region</th><th scope="col" className="px-3 py-2">Role</th>
          <th scope="col" className="px-3 py-2 text-right">Sentiment</th><th scope="col" className="px-3 py-2 text-right">Δ</th><th scope="col" className="px-3 py-2 text-right">News</th><th scope="col" className="px-3 py-2 text-right">Est. ticket</th><th scope="col" className="px-3 py-2 text-right">Est. own.</th><th scope="col" className="px-3 py-2">Confidence</th>
        </tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.slug} className="border-t border-border hover:bg-surface-2">
              <th scope="row" className="px-3 py-2 font-medium"><Link href={`/company/${c.slug}`} className="underline-offset-2 hover:underline">{c.name}</Link>{c.is_focus && <Badge tone="primary" className="ml-2">focus</Badge>}</th>
              <td className="px-3 py-2">{c.sector}</td><td className="px-3 py-2">{c.region}</td><td className="px-3 py-2">{c.b_capital_role}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtScore(c.score)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtDelta(c.delta)}</td><td className="px-3 py-2 text-right tabular-nums">{c.newsCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(c.estimated_ticket_size_usd)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtPct(c.estimated_ownership_pct)}</td>
              <td className="px-3 py-2"><Badge tone={c.estimate_confidence === "high" ? "primary" : c.estimate_confidence === "medium" ? "info" : "accent"} title={c.estimate_rationale}>est. · {c.estimate_confidence}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
