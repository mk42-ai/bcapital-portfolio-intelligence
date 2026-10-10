"use client";
/**
 * Sources block ABOVE the answer (Agent 10): to be collapsed into ONE compact chip row — publisher-first chips (favicon + host), "+N" overflow,
 * so the answer starts above the fold. Reserved min-height while live so chips appearing never shift the answer. Keeps testid `sources-rail`
 * (data-count) and `source-link` for the existing suite.
 */
import { ExternalLink } from "lucide-react";
import { faviconFor, type Source } from "./stream-store";

export function SourceChips({ sources, compact, live, streamingNow }: { sources: Source[]; compact?: boolean; live?: boolean; streamingNow?: boolean }) {
  // Reserved space: the rail always renders (min-height) during a live run so chips appearing never shift the answer below.
  if (!sources.length && !live) return null;
  return (
    <nav className={`oiu-sources${compact ? " oiu-sources--compact" : ""}${live ? " oiu-sources--live" : ""}`} aria-label="Sources" data-testid="sources-rail" data-count={sources.length}>
      <p className="oiu-sources__title">Sources ({sources.length}){live && !sources.length ? (streamingNow ? " · waiting for the first citation…" : " · the plugin returned no citations for this answer") : ""}</p>
      <ol className="oiu-sources__list">
        {sources.map((src, i) => (
          <li key={src.url} className="oiu-sources__item oiu-sources__item--in" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
            <a href={src.url} target="_blank" rel="noopener noreferrer" className="oiu-sources__link" data-testid="source-link">
              <span className="oiu-sources__num">{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faviconFor(src.url)} alt="" width={16} height={16} className="oiu-sources__favicon" loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" data-testid="source-favicon" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
              <span className="oiu-sources__text">
                <span className="oiu-sources__name">{src.title && src.title !== src.sourceName ? src.title : src.sourceName}</span>
                <span className="oiu-sources__meta"><span className="oiu-sources__host">{src.sourceName}</span><span className="oiu-sources__path">{src.url.replace(/^https?:\/\/(www\.)?[^/]+/, "").slice(0, 72) || "/"}</span></span>
              </span>
              <ExternalLink className="oiu-sources__ext" aria-hidden />
              <span className="sr-only"> (source {i + 1}, opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Back-compat alias. */
export const SourceList = SourceChips;
