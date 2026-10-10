"use client";
/**
 * Inline numbered citation chips (Agent 9). Rendered LIVE while streaming: `CitedMarkdown` rewrites every reference in the answer into a
 * `⟦n⟧` link and `CiteChip` paints it as a numbered brand-green chip beside the claim, with a hover card (favicon · title · publisher)
 * and click → source in a new tab. Numbering is identical for the live stream and the stored answer (extractCitations is pure).
 */
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractCitations, isCiteLabel, hostOf, type Cite } from "./citations";
import { faviconFor, type Source } from "./stream-store";
import "./cite-chip.css";

/** Numbered brand-green chip (18 px, pill) beside the claim. Focusable <a> → source in a new tab; hover/focus card = favicon · title · host. */
export const CiteChip = memo(function CiteChip({ n, cite }: { n: number; cite?: Cite }) {
  const url = cite?.url ?? "#"; const host = (cite?.sourceName && cite.sourceName !== url ? cite.sourceName : "") || hostOf(url);
  const title = cite?.title && cite.title !== url ? cite.title : host;
  const id = `oiu-cite-${n}-${host.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="oiu-cite" data-testid="citation-chip" data-n={n} data-host={host} aria-label={`Source ${n}: ${title}`} aria-describedby={id} title={`${title} — ${host}`}>
      <span className="oiu-cite__n" aria-hidden>{n}</span>
      <span className="oiu-cite__preview" role="tooltip" id={id} data-testid="citation-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={faviconFor(url)} alt="" width={14} height={14} loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
        <span className="oiu-cite__title">{title}</span><span className="oiu-cite__host">{host}</span>
      </span>
    </a>
  );
});
/** Debounced value: re-renders at most every `ms` while input keeps changing (markdown parse throttle, ~60 ms). */
export function useThrottled<T>(value: T, ms: number): T {
  const [v, setV] = useState(value); const last = useRef(0); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const now = Date.now(); const wait = Math.max(0, ms - (now - last.current));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { last.current = Date.now(); setV(value); }, wait);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, ms]);
  return v;
}
export const CitedMarkdown = memo(function CitedMarkdown({ text, known, streaming, onCites }: { text: string; known: Source[]; streaming: boolean; onCites?: (c: Cite[]) => void }) {
  // Adaptive markdown cadence: a 15 KB answer with GFM tables costs ~60–200 ms to re-parse; parse less often as the text grows (and on narrow viewports).
  const narrow = typeof matchMedia !== "undefined" && matchMedia("(max-width: 640px)").matches;
  const cadence = !streaming ? 0 : text.length > 9000 ? (narrow ? 600 : 400) : text.length > 4000 ? (narrow ? 400 : 250) : narrow ? 220 : 120;
  const throttled = useThrottled(text, cadence);
  const { md, cites } = useMemo(() => extractCitations(throttled, known, streaming), [throttled, known, streaming]);
  useEffect(() => { onCites?.(cites); }, [cites, onCites]);
  const components = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      const n = isCiteLabel(Array.isArray(children) ? children.map((c) => (typeof c === "string" ? c : "")).join("") : children);
      if (n) return <CiteChip n={n} cite={cites[n - 1]} />;
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
  }), [cites]);
  return <div className="oiu-md" data-testid="answer-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{md}</ReactMarkdown>{streaming && <span className="oiu-caret" aria-hidden />}</div>;
});

