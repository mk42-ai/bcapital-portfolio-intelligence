import type { Company } from "./types";
/** Status chips derived from the DB `status` field + the intelligence-JSON status changes (dates verified in the prior run). */
export type StatusChip = { kind: "IPO" | "rebrand" | "acquired" | "unicorn" | "public" | "funding"; label: string; date?: string; tone: "primary" | "accent" | "info" | "muted" };
const KNOWN: Record<string, StatusChip[]> = {
  "fervo-energy": [{ kind: "IPO", label: "IPO Nasdaq: FRVO", date: "2026-05-14", tone: "primary" }],
  meesho: [{ kind: "IPO", label: "IPO NSE/BSE ₹111", date: "2025-12-10", tone: "primary" }],
  "judi-rx": [{ kind: "rebrand", label: "Capital Rx → Judi Rx", date: "2026-07-15", tone: "info" }],
  "code-metal": [{ kind: "unicorn", label: "Unicorn · $1.25B Series B", date: "2026-02-19", tone: "accent" }],
  apptronik: [{ kind: "funding", label: "$935M Series A · ~$5.3B", date: "2026-02-11", tone: "accent" }],
  "perplexity-ai": [{ kind: "funding", label: "$20B valuation (Sep 2025)", date: "2025-09-30", tone: "accent" }],
  flutterwave: [{ kind: "funding", label: "Series E $262.75M · $3.2B", date: "2026-06-16", tone: "accent" }],
  writer: [{ kind: "funding", label: "Series C $200M · $1.9B", date: "2024-11-12", tone: "accent" }],
};
/** Synack is not among the 135 matrix rows; shown as a portfolio-level event only. */
export const PORTFOLIO_EVENTS: StatusChip[] = [
  { kind: "acquired", label: "Synack merged into NetSPI", date: "2026-10-05", tone: "muted" },
];
export function statusChips(c: Company): StatusChip[] {
  const chips = [...(KNOWN[c.slug] ?? [])];
  const s = c.status.toLowerCase();
  if (!chips.length) {
    if (s.includes("public")) chips.push({ kind: "public", label: "Public", tone: "primary" });
    if (s.includes("unicorn")) chips.push({ kind: "unicorn", label: "Unicorn", tone: "accent" });
    if (s.includes("renamed") || s.includes("rebrand")) chips.push({ kind: "rebrand", label: "Rebrand", tone: "info" });
    if (s.includes("merged") || s.includes("acquired")) chips.push({ kind: "acquired", label: "Acquired / merged", tone: "muted" });
  }
  return chips;
}
export function isAcquired(c: Company) { const s = c.status.toLowerCase(); return s.includes("merged") || s.includes("acquired"); }
