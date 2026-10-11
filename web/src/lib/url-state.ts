"use client";
/**
 * url-state.ts — Companies filter/sort/view/search state in the URL (shareable, back/forward safe).
 *
 * Pure part (unit-tested, no React): `parseCompaniesState(URLSearchParams)` and `serializeCompaniesState(state)`.
 * Defaults are OMITTED on serialize so the clean URL stays `/companies`; unknown values are coerced on parse so a
 * hand-edited link never breaks the page. `serialize(parse(x))` is stable (idempotent) and parse is order-independent.
 *
 * Hook part: `useUrlState(parse, serialize)` — generic client hook over next/navigation. State is initialised from
 * `useSearchParams()`, written back with `router.replace(?…, { scroll: false })` debounced 150 ms, and re-read whenever
 * `useSearchParams()` changes (effect keyed on `sp.toString()`), which is what makes browser back/forward work.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const COMPANIES_SORTS = ["name", "signal", "sector", "delta", "news", "deal"] as const; // a29 added delta / news / deal
export const COMPANIES_VIEWS = ["list", "grid"] as const;
export type CompaniesSort = (typeof COMPANIES_SORTS)[number];
export type CompaniesView = (typeof COMPANIES_VIEWS)[number];
export type CompaniesUrlState = { q: string; sector: string; sort: CompaniesSort; view: CompaniesView; letter: string };

export const COMPANIES_DEFAULTS: CompaniesUrlState = { q: "", sector: "", sort: "name", view: "list", letter: "" };
export const Q_MAX = 80;

const isSort = (v: string): v is CompaniesSort => (COMPANIES_SORTS as readonly string[]).includes(v);
const isView = (v: string): v is CompaniesView => (COMPANIES_VIEWS as readonly string[]).includes(v);

/** Parse `?q=&sector=&sort=&view=&letter=` with validation; unknown sort → "name", unknown view → "list", q trimmed ≤ 80. */
export function parseCompaniesState(sp: URLSearchParams): CompaniesUrlState {
  const q = (sp.get("q") ?? "").trim().slice(0, Q_MAX);
  const sector = (sp.get("sector") ?? "").trim();
  const sortRaw = (sp.get("sort") ?? "").trim().toLowerCase();
  const viewRaw = (sp.get("view") ?? "").trim().toLowerCase();
  const letterRaw = (sp.get("letter") ?? "").trim().toUpperCase();
  return {
    q, sector,
    sort: isSort(sortRaw) ? sortRaw : COMPANIES_DEFAULTS.sort,
    view: isView(viewRaw) ? viewRaw : COMPANIES_DEFAULTS.view,
    letter: /^[A-Z#]$/.test(letterRaw) ? letterRaw : "",
  };
}

/** Serialize to a query string WITHOUT the leading `?`; defaults omitted → "" for the clean `/companies` URL. */
export function serializeCompaniesState(state: Partial<CompaniesUrlState>): string {
  const s: CompaniesUrlState = { ...COMPANIES_DEFAULTS, ...state };
  const out = new URLSearchParams();
  const q = s.q.trim().slice(0, Q_MAX);
  if (q) out.set("q", q);
  if (s.sector.trim()) out.set("sector", s.sector.trim());
  if (s.sort !== COMPANIES_DEFAULTS.sort && isSort(s.sort)) out.set("sort", s.sort);
  if (s.view !== COMPANIES_DEFAULTS.view && isView(s.view)) out.set("view", s.view);
  if (s.letter && /^[A-Z#]$/.test(s.letter)) out.set("letter", s.letter);
  return out.toString();
}

export type UrlStateSetter<T> = (patch: Partial<T> | ((prev: T) => T)) => void;

/**
 * Generic URL-backed state. `parse` must be total (never throw) and `serialize(parse(x))` should be stable.
 * Returns `[state, set, serialized]`. `initial` (optional, a query string without `?`) seeds the first render when the
 * page passes `searchParams` through from the server, keeping SSR and hydration in agreement.
 */
export function useUrlState<T>(parse: (sp: URLSearchParams) => T, serialize: (state: T) => string, initial?: string, debounceMs = 150): [T, UrlStateSetter<T>, string] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const spString = sp?.toString() ?? "";
  const [state, setState] = useState<T>(() => parse(new URLSearchParams(initial ?? spString)));
  const serialized = serialize(state);
  const timer = useRef<number | undefined>(undefined);
  const lastWritten = useRef<string | null>(null); // our own echo — ignored when it comes back through useSearchParams
  const stateRef = useRef(state); stateRef.current = state;

  // Back/forward (and any external navigation): re-read when the URL's params change.
  useEffect(() => {
    const incoming = serialize(parse(new URLSearchParams(spString)));
    if (incoming === lastWritten.current) { lastWritten.current = null; return; }
    if (timer.current) return; // a local edit is still pending — it will win and rewrite the URL
    if (incoming !== serialize(stateRef.current)) setState(parse(new URLSearchParams(spString)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spString]);

  const set = useCallback<UrlStateSetter<T>>((patch) => {
    setState((prev) => {
      const next = typeof patch === "function" ? (patch as (p: T) => T)(prev) : { ...prev, ...patch };
      const qs = serialize(next);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        const current = serialize(parse(new URLSearchParams(window.location.search)));
        if (current === qs) return;
        lastWritten.current = qs;
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }, debounceMs);
      return next;
    });
  }, [serialize, parse, router, pathname, debounceMs]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return [state, set, serialized];
}
