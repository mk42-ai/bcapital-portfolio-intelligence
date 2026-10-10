"use client";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SYNERGY_MATRIX, type SynergyRow } from "@/lib/synergy-matrix";

/** Rail picks: one row per testid, in reading order. Falls back gracefully if a testid is renamed in the matrix. */
const RAIL_PICKS: { testid: string; label: string }[] = [
  { testid: "clarification-form", label: "Clarification form" },
  { testid: "step-summary", label: "Checkpoint cards" },
  { testid: "plugin-chip", label: "Favicon chips" },
  { testid: "plugin-activity", label: "Honest failure" },
  { testid: "citation-chip", label: "Inline citations" },
];

function pickRow(testid: string, label: string): SynergyRow | undefined {
  const rows = SYNERGY_MATRIX.filter((r) => r.testid === testid);
  if (rows.length <= 1) return rows[0];
  // "plugin-activity" has two rows; the honest-failure one mentions failure.
  return rows.find((r) => /fail/i.test(r.ui) || /fail/i.test(r.why)) ?? rows[0];
}

/** Compact "Why it's interactive" panel for the chat Agent rail. Another component mounts it; it owns no state. */
export function WhyInteractive({ className = "" }: { className?: string }) {
  const items = RAIL_PICKS.map((p) => ({ ...p, row: pickRow(p.testid, p.label) })).filter((p) => p.row);
  return (
    <Card className={className} data-testid="why-interactive">
      <CardHeader className="p-4 pb-1.5">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 shrink-0" aria-hidden style={{ color: "var(--brand-green-ink)" }} />
          Why it&rsquo;s interactive
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1.5">
        <ul className="space-y-2 text-xs leading-relaxed">
          {items.map(({ testid, label, row }) => (
            <li key={testid} className="flex gap-2" data-testid="why-interactive-item" data-row={testid}>
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--brand-green)" }} />
              <span className="min-w-0">
                <span className="font-medium text-foreground">{label}</span>
                <span className="text-muted"> — {row!.why}</span>
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/docs/interactive-ui"
          className="mt-3 inline-flex min-h-8 items-center gap-1 rounded-md text-xs font-medium underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: "var(--brand-green-ink)", outlineColor: "var(--brand-green)" }}
          data-testid="why-interactive-link"
        >
          Full synergy matrix <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}

export default WhyInteractive;
