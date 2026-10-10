"use client";
/**
 * Compact source row ABOVE the answer (Agent 10): ONE 32 px row of publisher-first chips (favicon + host, title in the tooltip),
 * max 5 visible, then a "+N" chip that expands inline (aria-expanded) to reveal the rest. While a run is live the row reserves exactly
 * 32 px (min-height) so chips appearing never shift the answer; a finished run with zero sources renders nothing (honest status is
 * owned by the plugin timeline / Agent 18). Keeps `sources-rail` (data-count) and `source-link` (href, _blank, noopener) for the suite.
 */
import { useId, useState } from "react";
import { faviconFor, type Source } from "./stream-store";
import "./source-chips.css";

export const MAX_VISIBLE_SOURCES = 5;

const hostLabel = (s: Source) => (s.sourceName || s.url).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export function SourceChips({ sources, compact, live, streamingNow }: { sources: Source[]; compact?: boolean; live?: boolean; streamingNow?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  // Reserve the row only while the run is still streaming (chips can still arrive); a finished run with no citations shows nothing.
  if (!sources.length && !(live && streamingNow)) return null;
  const hidden = Math.max(0, sources.length - MAX_VISIBLE_SOURCES);
  const shown = expanded || !hidden ? sources : sources.slice(0, MAX_VISIBLE_SOURCES);
  return (
    <nav
      className={`oiu-srcrow${compact ? " oiu-srcrow--compact" : ""}${live ? " oiu-srcrow--live" : ""}${expanded && hidden ? " oiu-srcrow--expanded" : ""}`}
      aria-label={sources.length ? `Sources (${sources.length})` : "Sources"}
      data-testid="sources-rail"
      data-count={sources.length}
      data-expanded={expanded && hidden ? "true" : "false"}
    >
      <ol className="oiu-srcrow__list" id={listId}>
        {shown.map((src, i) => {
          const host = hostLabel(src);
          const tip = src.title && src.title !== src.sourceName && src.title !== src.url ? `${src.title} — ${src.url}` : src.url;
          return (
            <li key={src.url} className="oiu-srcrow__item">
              <a href={src.url} target="_blank" rel="noopener noreferrer" className="oiu-srcrow__chip" data-testid="source-link" title={tip} aria-label={`Source ${i + 1}: ${host}${src.title && src.title !== host ? ` — ${src.title}` : ""} (opens in a new tab)`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={faviconFor(src.url)} alt="" width={14} height={14} className="oiu-srcrow__favicon" loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" data-testid="source-favicon" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                <span className="oiu-srcrow__host">{host}</span>
              </a>
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="oiu-srcrow__item">
            <button
              type="button"
              className="oiu-srcrow__chip oiu-srcrow__more"
              data-testid="sources-more"
              aria-expanded={expanded}
              aria-controls={listId}
              aria-label={expanded ? `Show fewer sources` : `Show ${hidden} more source${hidden === 1 ? "" : "s"}`}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : `+${hidden}`}
            </button>
          </li>
        )}
      </ol>
    </nav>
  );
}

/** Back-compat alias. */
export const SourceList = SourceChips;
