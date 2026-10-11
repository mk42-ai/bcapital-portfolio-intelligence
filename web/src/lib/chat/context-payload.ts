/**
 * context-payload.ts — PURE builder for the portfolio context sent with every /api/chat turn.
 *
 * Why this exists (turn-4 UNIT 2): the payload used to be assembled inside ChatShell's render and captured by the memoised fetch
 * wrapper, so a stale closure could send an older company set than the chips in the inspector showed (screenshot
 * web/proof/inputs/2026-10-11/02-answer-view-1712x859.png — chips: AIMotive, payload: Perplexity AI). ChatShell now calls
 * `buildContextPayload(companies, getSettings().companies, …)` AT SEND TIME, so the payload always mirrors the live chip state.
 *
 * Field naming: the model kept presenting deltas as "the sentiment ranking". The payload therefore carries DISTINCT fields —
 * `sentiment_score` (current score in [-1, 1]) and `sentiment_delta_vs_prior_run` (change since the previous scoring run, null on the
 * first run) — and the systemContext text spells the difference out.
 */
export type ContextInputCompany = {
  slug: string; name: string; sector: string; status: string; stage: string | null;
  sentiment: { score: number; label: string; delta?: number | null; updated_at?: string | null; basis?: string | null };
  /** Timestamp of the previous scoring run when the backend exposes it; absent/null on the first run. */
  prior_run_at?: string | null;
  news_count?: number;
  latest_news: { title: string; url: string | null; published_at: string | null; source?: string | null }[];
  estimated_ticket_size_usd?: number | null;
};
export type ContextCompany = {
  slug: string; name: string; sector: string; status: string; stage: string | null;
  /** Current sentiment score in [-1, 1]. */
  sentiment_score: number;
  sentiment_label: string;
  /** Change since the previous scoring run; null when there is no prior run (first run). */
  sentiment_delta_vs_prior_run: number | null;
  /** "first run" when there is no prior run — i.e. delta is null OR delta equals the score (the baseline was 0). */
  run_status: "first run" | "scored vs prior run";
  prior_run_at: string | null;
  scored_at: string | null;
  basis: string | null;
  news_count: number;
  latest_headlines: { title: string; published_at: string | null; source: string | null }[];
  estimated_ticket_size_usd: number | null;
};
export type ContextPayload = {
  companies: ContextCompany[];
  systemContext: string;
  sessionContext: { key: string; value: string }[];
  /** "Context: N companies — A, B, C" or "Context: none — pick up to 5 companies in the inspector". */
  summary: string;
};

const fmt = (n: number | null | undefined) => (n == null ? "—" : (n > 0 ? "+" : "") + n.toFixed(2));
export const EMPTY_CONTEXT_SUMMARY = "Context: none — pick up to 5 companies in the inspector";
export const CONTEXT_FIELD_GUIDE =
  "Field guide: sentiment_score = current score in [-1,1]; sentiment_delta_vs_prior_run = change since the previous scoring run (null / 'first run' when there is none); never present deltas as the sentiment ranking — rank by sentiment_score, and report movement separately as 'change vs prior run (Δ)'. Say 'first run' when there is no prior run; do not invent movement.";

/** True when the company has no usable prior run: delta missing, or delta identical to the score (baseline was zero). */
export function isFirstRun(c: Pick<ContextInputCompany, "sentiment" | "prior_run_at">): boolean {
  const d = c.sentiment.delta;
  if (d == null) return true;
  if (Math.abs(d - c.sentiment.score) < 1e-9) return true;
  return false;
}

export function toContextCompany(c: ContextInputCompany): ContextCompany {
  const first = isFirstRun(c);
  return {
    slug: c.slug, name: c.name, sector: c.sector, status: c.status, stage: c.stage ?? null,
    sentiment_score: c.sentiment.score,
    sentiment_label: c.sentiment.label,
    sentiment_delta_vs_prior_run: first ? null : (c.sentiment.delta as number),
    run_status: first ? "first run" : "scored vs prior run",
    prior_run_at: first ? null : c.prior_run_at ?? null,
    scored_at: c.sentiment.updated_at ?? null,
    basis: c.sentiment.basis ?? null,
    news_count: c.news_count ?? c.latest_news.length,
    latest_headlines: c.latest_news.slice(0, 3).map((n) => ({ title: n.title, published_at: n.published_at ?? null, source: n.source ?? null })),
    estimated_ticket_size_usd: c.estimated_ticket_size_usd ?? null,
  };
}

export function contextSummary(names: string[]): string {
  if (!names.length) return EMPTY_CONTEXT_SUMMARY;
  return `Context: ${names.length} ${names.length === 1 ? "company" : "companies"} — ${names.join(", ")}`;
}

/** Builds the payload for EXACTLY the selected slugs, in selection order (unknown slugs are skipped). */
export function buildContextPayload(companies: ContextInputCompany[], selectedSlugs: string[], opts: { fetchedAt?: string } = {}): ContextPayload {
  const bySlug = new Map(companies.map((c) => [c.slug, c] as const));
  const picked = selectedSlugs.map((s) => bySlug.get(s)).filter((c): c is ContextInputCompany => !!c);
  const out = picked.map(toContextCompany);
  const summary = contextSummary(out.map((c) => c.name));
  if (!out.length) return { companies: [], systemContext: "", sessionContext: [], summary };
  const header = `Portfolio data below comes from the B Capital portfolio API (live backend, fetched ${opts.fetchedAt ?? new Date().toISOString()}). Use it ONLY for portfolio-internal questions (sentiment scores, changes vs prior run, which context companies moved, headline counts). For anything about external facts — recent announcements, funding rounds, valuations, IPOs, products, people, comparisons with earlier events — ALWAYS run the Perplexity web search and answer from fresh sources with citations; never say the feed lacks information when the web can answer it. ${CONTEXT_FIELD_GUIDE} A basis of "seed placeholder" means the score has not been scored by the workflow yet.`;
  const lines = out.map((c) => `• ${c.name} — sector: ${c.sector}; status: ${c.status}; stage: ${c.stage ?? "n/a"}; sentiment_score: ${fmt(c.sentiment_score)} (${c.sentiment_label}); sentiment_delta_vs_prior_run: ${c.sentiment_delta_vs_prior_run == null ? "null (first run)" : fmt(c.sentiment_delta_vs_prior_run)}; prior_run_at: ${c.prior_run_at ?? "n/a"}; scored_at: ${c.scored_at ?? "n/a"}; basis: ${c.basis ?? "n/a"}; est. ticket ${c.estimated_ticket_size_usd ?? "n/a"}; news_count: ${c.news_count}; latest_headlines: ${c.latest_headlines.length ? c.latest_headlines.map((n) => `"${n.title}" (${n.published_at ?? "undated"}, ${n.source ?? "source n/a"})`).join("; ") : "none"}`);
  const systemContext = `${header}\n${lines.join("\n")}`.slice(0, 6000);
  const sessionContext = out.map((c) => ({ key: `company:${c.slug}`, value: JSON.stringify({ name: c.name, sector: c.sector, status: c.status, sentiment_score: c.sentiment_score, sentiment_label: c.sentiment_label, sentiment_delta_vs_prior_run: c.sentiment_delta_vs_prior_run, run_status: c.run_status, prior_run_at: c.prior_run_at, news_count: c.news_count, latest_headlines: c.latest_headlines }).slice(0, 1800) }));
  return { companies: out, systemContext, sessionContext, summary };
}
