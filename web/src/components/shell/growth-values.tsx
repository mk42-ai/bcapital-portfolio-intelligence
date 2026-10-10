"use client";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import "./growth-values.css";

type GrowthValue = { key: string; letter: string; name: string; description: string; example: string };

/** B Capital's GROWTH values, one line each in the firm's voice, plus one concrete example behaviour. */
export const GROWTH_VALUES: GrowthValue[] = [
  { key: "generosity", letter: "G", name: "Generosity", description: "We give first: time, introductions, candour — because founders' wins compound.", example: "A partner opens their network before a term sheet is signed." },
  { key: "resilience", letter: "R", name: "Resilience", description: "We back companies through the hard middle, not just the launch.", example: "We double down in the down round when the plan still holds." },
  { key: "open-mindedness", letter: "O", name: "Open-mindedness", description: "We question our priors and change our minds on evidence.", example: "A junior's dissent changes the IC memo." },
  { key: "will", letter: "W", name: "Will", description: "We bring the stubbornness to finish what we start.", example: "Eighteen months of follow-through on a slow enterprise sale." },
  { key: "teamwork", letter: "T", name: "Teamwork", description: "One firm across three continents, one cap table at a time.", example: "Singapore, LA and Beijing pass the same deal baton." },
  { key: "humility", letter: "H", name: "Humility", description: "Founders build companies; we are catalysts, not heroes.", example: "We ask the founder what we got wrong." },
];

/**
 * Sequential G‑R‑O‑W‑T‑H reveal: observe the list once; when ≥25% is in view flip `data-revealed` and let CSS stagger
 * each item via `--i`. SSR-safe (effect only), and if IntersectionObserver is missing we reveal immediately.
 */
function useRevealOnEnter<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (revealed) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setRevealed(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.25)) { setRevealed(true); io.disconnect(); }
      },
      { threshold: [0.25] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [revealed]);
  return { ref, revealed };
}

export function GrowthValues({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const { ref: gridRef, revealed } = useRevealOnEnter<HTMLUListElement>();

  function toggle(key: string) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = GROWTH_VALUES.length;
    let next: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % n;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    buttons.current[next]?.focus();
  }

  return (
    <ul
      ref={gridRef}
      className={`growth-grid mt-8 grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 ${className}`.trim()}
      aria-label="GROWTH values"
      data-testid="growth-grid"
      data-brand="green"
      data-revealed={revealed ? "true" : "false"}
    >
      {GROWTH_VALUES.map((v, i) => {
        const isOpen = !!open[v.key];
        const btnId = `growth-btn-${v.key}`;
        const panelId = `growth-panel-${v.key}`;
        return (
          <li key={v.key} className="growth-item card min-w-0" data-open={isOpen ? "true" : "false"} style={{ "--i": i } as CSSProperties}>
            <button
              ref={(el) => { buttons.current[i] = el; }}
              type="button"
              id={btnId}
              className="growth-btn flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left"
              aria-expanded={isOpen}
              aria-controls={panelId}
              data-testid="growth-value"
              data-value={v.key}
              onClick={() => toggle(v.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span aria-hidden="true" data-testid="growth-tile" className="growth-tile grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 font-display text-base font-bold text-foreground">
                {v.letter}
              </span>
              <span className="growth-name min-w-0 flex-1 text-sm font-medium">{v.name}</span>
              <ChevronDown aria-hidden="true" className="growth-chevron size-4 shrink-0 text-muted" strokeWidth={2} />
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              aria-hidden={!isOpen}
              data-testid="growth-panel"
              data-state={isOpen ? "open" : "closed"}
              className="growth-panel"
            >
              <div className="growth-panel-inner" inert={!isOpen}>
                <p className="px-3 pt-0 text-sm leading-relaxed text-muted">{v.description}</p>
                <p className="growth-example px-3 pb-3 pt-1.5 text-sm leading-relaxed text-foreground" data-testid="growth-example">
                  <span className="growth-example-label">Example behaviour</span>
                  {v.example}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
