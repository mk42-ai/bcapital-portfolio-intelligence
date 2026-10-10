/**
 * Streaming citation parser (Agent 9). Turns the answer markdown into (a) an ordered, de-duplicated source list and (b) a markdown
 * variant in which every reference is rewritten as a link whose label is the sentinel `⟦n⟧` — the renderer turns those links into
 * numbered chips (cite-chip.tsx).
 *
 * Merge order (pure + deterministic, so the live stream and the stored answer agree):
 *   1. text order — markdown links `[label](url)`, autolinks `<url>`, bare URLs and numeric markers `[n]`, numbered by FIRST appearance;
 *   2. plugin sources (`CUSTOM ondemand.sources` → stream-store `sources`) the prose never mentioned, appended in plugin order.
 * A text URL that matches a plugin source borrows its title / imageUrl; a `[n]` marker that indexes into the plugin list resolves to
 * that source's URL (and is left as literal text until the list is known — the chip appears on the very next render once it is).
 * While `streaming`, a link / URL still being typed at the tail of the text is left alone until a later delta closes it.
 */
export type Cite = { url: string; title: string; sourceName: string; imageUrl?: string };
const MD_LINK = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g;
const AUTO_LINK = /<(https?:\/\/[^\s<>]+)>/g;
const BARE_URL = /(?<!\]\()(?<!["'<])https?:\/\/[^\s\]}>"'`]+/g; // not the target of a (already rewritten) markdown link
const NUM_MARK = /\[(\d{1,2})\](?!\()/g;
const TRAIL = /[.,;:!?)]+$/;
/** Strip sentence punctuation that the prose glued onto a URL ("…see https://x.com/a." → "https://x.com/a"). A `)` is only trimmed when unbalanced. */
export const trimUrl = (u: string) => {
  let s = u.replace(/[.,;:!?]+$/, "");
  while (s.endsWith(")") && (s.match(/\(/g)?.length ?? 0) < (s.match(/\)/g)?.length ?? 0)) s = s.slice(0, -1).replace(/[.,;:!?]+$/, "");
  return s;
};
/** Identity key for de-duplication: trimmed, no trailing slash, no fragment, scheme/host lower-cased. */
export const citeKey = (u: string) => {
  const t = trimUrl(u);
  try { const x = new URL(t); x.hash = ""; return `${x.protocol}//${x.host}${x.pathname.replace(/\/+$/, "")}${x.search}`.toLowerCase(); } catch { return t.replace(/\/+$/, "").toLowerCase(); }
};
export const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export function extractCitations(text: string, known: Cite[] = [], streaming = false): { md: string; cites: Cite[] } {
  const order: Cite[] = []; const idx = new Map<string, number>();
  const knownByKey = new Map<string, Cite>(); for (const k of known) if (k && typeof k.url === "string" && k.url) { const kk = citeKey(k.url); if (!knownByKey.has(kk)) knownByKey.set(kk, k); }
  const add = (url: string, title?: string, imageUrl?: string) => {
    const u = trimUrl(url); if (!u) return 0;
    const key = citeKey(u);
    let n = idx.get(key);
    if (!n) {
      const k = knownByKey.get(key);
      const t = (title && title.trim() && title.trim() !== u && !/^https?:\/\//.test(title.trim()) ? title.trim() : k?.title && k.title !== k.url ? k.title : "") || hostOf(u);
      const img = k?.imageUrl ?? imageUrl;
      order.push({ url: k?.url ? trimUrl(k.url) : u, title: t, sourceName: k?.sourceName && k.sourceName !== k.url ? k.sourceName : hostOf(u), ...(img ? { imageUrl: img } : {}) });
      n = order.length; idx.set(key, n);
    }
    return n;
  };
  // Incomplete tail during streaming: a link/URL still being typed is left alone until the next delta closes it.
  const tailSafe = (end: number) => !streaming || end < text.length - 1 || /[\s)\].,;:!?>]$/.test(text);
  let md = text.replace(MD_LINK, (m, label: string, url: string, off: number) => {
    if (!tailSafe(off + m.length)) return m;
    const bare = /^https?:\/\//.test(label.trim()) || /^\d{1,2}$/.test(label.trim()); // `[https://…](…)` / `[3](…)` → chip only, no echoed label
    const n = add(url, bare ? undefined : label); const u = trimUrl(url);
    return bare ? `[⟦${n}⟧](${u})` : `${label} [⟦${n}⟧](${u})`;
  });
  md = md.replace(AUTO_LINK, (m, url: string, off: number) => { if (!tailSafe(off + m.length)) return m; const n = add(url); return `[⟦${n}⟧](${trimUrl(url)})`; });
  md = md.replace(BARE_URL, (m, off: number) => {
    if (!tailSafe(off + m.length)) return m;
    const u = trimUrl(m); if (!u || u.length < 11) return m; // "https://x.y" is the shortest thing worth a chip
    const n = add(m); return `[⟦${n}⟧](${u})${m.slice(u.length)}`; // keep the sentence punctuation the regex swallowed
  });
  md = md.replace(NUM_MARK, (m, d: string) => { const k = known[Number(d) - 1]; if (!k || !k.url) return m; const n = add(k.url, k.title, k.imageUrl); return `[⟦${n}⟧](${trimUrl(k.url)})`; });
  for (const k of known) if (k && k.url) add(k.url, k.title, k.imageUrl); // plugin sources the prose never linked still get a number in the rail
  return { md, cites: order };
}
export const isCiteLabel = (s: unknown): number | null => { const m = /^⟦(\d+)⟧$/.exec(typeof s === "string" ? s : Array.isArray(s) ? s.join("") : ""); return m ? Number(m[1]) : null; };
