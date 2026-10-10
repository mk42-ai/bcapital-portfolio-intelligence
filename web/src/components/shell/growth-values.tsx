"use client";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import "./growth-values.css";

type GrowthValue = {
  key: string;
  letter: string;
  name: string;
  /** One-line definition in the firm's voice. */
  description: string;
  /** What the value looks like at B Capital specifically — the firm's own behaviour. */
  here: string;
  /** One concrete example behaviour. */
  example: string;
};

/** B Capital's GROWTH values: definition, what it looks like here, and one concrete example behaviour. */
export const GROWTH_VALUES: GrowthValue[] = [
  {
    key: "generosity",
    letter: "G",
    name: "Generosity",
    description: "We give first: time, introductions, candour — because founders' wins compound.",
    here: "Portfolio founders get warm intros to each other and to LPs without asking twice.",
    example: "A partner opens their network before a term sheet is signed.",
  },
  {
    key: "resilience",
    letter: "R",
    name: "Resilience",
    description: "We back companies through the hard middle, not just the launch.",
    here: "We stayed on the cap table through 2022–23 repricings instead of marking and walking.",
    example: "We double down in the down round when the plan still holds.",
  },
  {
    key: "open-mindedness",
    letter: "O",
    name: "Open-mindedness",
    description: "We question our priors and change our minds on evidence.",
    here: "Investment memos carry a dissent section that must be answered before a vote.",
    example: "A junior's dissent changes the IC memo.",
  },
  {
    key: "will",
    letter: "W",
    name: "Will",
    description: "We have the stubbornness to finish what we start.",
    here: "Deal teams keep weekly founder check-ins for the full hold period, not just the first year.",
    example: "Eighteen months of follow-through on a slow enterprise sale.",
  },
  {
    key: "teamwork",
    letter: "T",
    name: "Teamwork",
    description: "One firm across three continents, one cap table at a time.",
    here: "Every deal has a cross-office second partner from day one.",
    example: "Singapore, LA and Beijing pass the same deal baton.",
  },
  {
    key: "humility",
    letter: "H",
    name: "Humility",
    description: "Founders build companies; we are catalysts, not heroes.",
    here: "Annual founder NPS is read aloud at the partner offsite, lowest scores first.",
    example: "We ask the founder what we got wrong.",
  },
];

/** Light-up timing: each tile holds the green fill for LIT_MS, tiles start LIT_STAGGER_MS apart (G→R→O→W→T→H). */
const LIT_MS = 350;
const LIT_STAGGER_MS = 120;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Reveal-on-enter + one-shot sequential light-up.
 * - `revealed` flips when the list is ≥25% in view (CSS handles the opacity/translate reveal, staggered by `--i`).
 * - `lit` is the index of the tile currently holding the green fill (-1 = none). A timer chain walks 0..n-1 exactly once,
 *   guarded by a ref so re-renders, StrictMode double-effects and re-entry never replay it.
 * - SSR-safe (effects only). No IntersectionObserver → reveal immediately, skip light-up. Reduced motion → skip light-up.
 */
function useRevealAndLightUp<T extends HTMLElement>(count: number) {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [lit, setLit] = useState<number>(-1);
  const litRan = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (revealed) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setRevealed(true); // no light-up without an observer: nothing to sequence against
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.25)) return;
        io.disconnect();
        setRevealed(true);
        if (litRan.current || prefersReducedMotion()) return;
        litRan.current = true;
        const chain: ReturnType<typeof setTimeout>[] = [];
        for (let i = 0; i < count; i++) {
          chain.push(setTimeout(() => setLit(i), i * LIT_STAGGER_MS));
        }
        chain.push(setTimeout(() => setLit(-1), (count - 1) * LIT_STAGGER_MS + LIT_MS));
        timers.current = chain;
      },
      { threshold: [0.25] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [revealed, count]);

  // Clear any pending light-up timers on unmount.
  useEffect(() => {
    const t = timers;
    return () => { t.current.forEach(clearTimeout); t.current = []; };
  }, []);

  return { ref, revealed, lit };
}

export function GrowthValues({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const { ref: gridRef, revealed, lit } = useRevealAndLightUp<HTMLUListElement>(GROWTH_VALUES.length);

  function toggle(key: string) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = GROWTH_VALUES.length;
    // Escape collapses the focused tile when it is open (focus stays on the button — WAI-ARIA disclosure pattern).
    if (e.key === "Escape") {
      const key = GROWTH_VALUES[i].key;
      if (open[key]) { e.preventDefault(); setOpen((prev) => ({ ...prev, [key]: false })); }
      return;
    }
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
        const isLit = lit === i;
        const btnId = `growth-btn-${v.key}`;
        const panelId = `growth-panel-${v.key}`;
        return (
          <li
            key={v.key}
            className="growth-item card min-w-0"
            data-open={isOpen ? "true" : "false"}
            data-lit={isLit ? "true" : undefined}
            style={{ "--i": i } as CSSProperties}
          >
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
              <span
                aria-hidden="true"
                data-testid="growth-tile"
                data-lit={isLit ? "true" : undefined}
                className="growth-tile grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 font-display text-base font-bold text-foreground"
              >
                {v.letter}
              </span>
              <span className="growth-name min-w-0 flex-1 text-sm font-medium">{v.name}</span>
              <ChevronDown aria-hidden="true" data-testid="growth-chevron" className="growth-chevron size-4 shrink-0 text-muted" strokeWidth={2} />
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
                <dl className="growth-lines px-3 pb-3">
                  <div className="growth-line" data-testid="growth-definition">
                    <dt className="growth-line-label">Definition</dt>
                    <dd className="growth-line-text text-sm leading-relaxed text-muted">{v.description}</dd>
                  </div>
                  <div className="growth-line" data-testid="growth-here">
                    <dt className="growth-line-label">What it looks like here</dt>
                    <dd className="growth-line-text text-sm leading-relaxed text-foreground">{v.here}</dd>
                  </div>
                  <div className="growth-line growth-example" data-testid="growth-example">
                    <dt className="growth-line-label">Example</dt>
                    <dd className="growth-line-text text-sm leading-relaxed text-foreground">{v.example}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
