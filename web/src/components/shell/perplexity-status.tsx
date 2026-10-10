"use client";
/**
 * ONE honest Perplexity status banner in Settings (Agent 18): if the OnDemand account has no Perplexity credits ("not enough credits"),
 * say so here — once — instead of red error cards in the thread. SKELETON — Agent 18 implements the probe route + states.
 */
export function PerplexityStatus() {
  return <div data-testid="perplexity-status" data-state="unknown" className="rounded-md border border-border bg-surface-2 p-3 text-sm text-muted">Perplexity status: checking…</div>;
}
