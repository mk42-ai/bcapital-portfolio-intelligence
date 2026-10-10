/**
 * Streaming citation parser. Turns the answer markdown into (a) an ordered, de-duplicated source list and (b) a markdown variant
 * in which every reference is rewritten as a link whose label is the sentinel `⟦n⟧` — the renderer turns those links into numbered
 * chips. Pure and deterministic: the numbering only depends on order of first appearance in the text, then on the plugin-supplied
 * sources that the text never mentioned, so the live stream and the stored answer agree.
 */
export type Cite = { url: string; title: string; sourceName: string; imageUrl?: string };
const MD_LINK = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL = /(?<![("'\]])https?:\/\/[^\s)\]}>"'`]+/g;
const NUM_MARK = /\[(\d{1,2})\](?!\()/g;
const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, "");
export const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export function extractCitations(text: string, known: Cite[] = [], streaming = false): { md: string; cites: Cite[] } {
  const order: Cite[] = []; const idx = new Map<string, number>();
  const add = (url: string, title?: string, imageUrl?: string) => {
    const u = trimUrl(url); if (!u) return 0;
    let n = idx.get(u);
    if (!n) { const k = known.find((c) => trimUrl(c.url) === u); order.push({ url: u, title: (title && title !== u ? title : k?.title) || hostOf(u), sourceName: hostOf(u), ...(k?.imageUrl || imageUrl ? { imageUrl: k?.imageUrl ?? imageUrl } : {}) }); n = order.length; idx.set(u, n); }
    return n;
  };
  // Incomplete tail during streaming: a link/URL still being typed is left alone until the next delta closes it.
  const tailSafe = (end: number) => !streaming || end < text.length - 1 || /[\s)\].,;:!?]$/.test(text);
  let md = text.replace(MD_LINK, (m, label: string, url: string, off: number) => {
    if (!tailSafe(off + m.length)) return m;
    const n = add(url, label); return /^https?:\/\//.test(label) ? `[⟦${n}⟧](${trimUrl(url)})` : `${label} [⟦${n}⟧](${trimUrl(url)})`;
  });
  md = md.replace(BARE_URL, (m, off: number) => { if (!tailSafe(off + m.length)) return m; const n = add(m); return `[⟦${n}⟧](${trimUrl(m)})`; });
  md = md.replace(NUM_MARK, (m, d: string) => { const k = known[Number(d) - 1]; if (!k) return m; const n = add(k.url, k.title, k.imageUrl); return `[⟦${n}⟧](${trimUrl(k.url)})`; });
  for (const k of known) add(k.url, k.title, k.imageUrl); // plugin sources the prose never linked still get a number in the rail
  return { md, cites: order };
}
export const isCiteLabel = (s: unknown): number | null => { const m = /^⟦(\d+)⟧$/.exec(typeof s === "string" ? s : Array.isArray(s) ? s.join("") : ""); return m ? Number(m[1]) : null; };
