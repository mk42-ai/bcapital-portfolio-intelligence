/**
 * Report artifact file names derived from the ANSWER (first H1 / H2 / sentence), never from the raw prompt — a typo'd prompt such as
 * "create me a docuemnt on all of these companies" must not become the file name. Pure, unit-tested (web/tests/unit/naming.test.ts).
 */
const STOP = new Set(["a", "an", "the", "me", "on", "of", "for"]);
const MAX_SLUG = 48;

/** ascii, lowercase, hyphen-separated, stop words removed, ≤ 48 chars (cut on a word boundary when possible). */
export function slugify(input: string, { stripStop = true, max = MAX_SLUG }: { stripStop?: boolean; max?: number } = {}): string {
  const ascii = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ");
  let words = ascii.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (stripStop) { const kept = words.filter((w) => !STOP.has(w)); if (kept.length) words = kept; }
  let out = "";
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > max) { if (!out) out = w.slice(0, max); break; }
    out = next;
  }
  return out.replace(/^-+|-+$/g, "");
}

/** First `# H1`, else first `## H2`, else the first sentence (≤ 8 words) of the markdown body; "" when nothing usable. */
export function titleFromMarkdown(md: string): string {
  const text = (md ?? "").replace(/\r/g, "");
  const clean = (s: string) => s.replace(/[*_`~]+/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  const h1 = text.match(/^\s*#\s+(.+?)\s*#*\s*$/m);
  if (h1 && clean(h1[1])) return clean(h1[1]);
  const h2 = text.match(/^\s*##\s+(.+?)\s*#*\s*$/m);
  if (h2 && clean(h2[1])) return clean(h2[1]);
  const body = text.split("\n").map((l) => l.trim()).filter((l) => l && !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|---)/.test(l)).join(" ");
  const sentence = clean(body).split(/(?<=[.!?])\s+/)[0] ?? "";
  const words = sentence.split(/\s+/).filter(Boolean);
  return words.slice(0, 8).join(" ").replace(/[.!?:,;]+$/, "");
}

/** Legacy prompt slug (what the bridge used to name the file) — kept as the alias so old links / expectations still resolve. */
export const promptSlug = (q: string) => (q.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).slice(0, 6).join("-").toLowerCase() || "report").slice(0, 60);

const isoDay = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`; };

/**
 * `{ name, alias }` for a generated report: name = `<answer-derived slug>-YYYY-MM-DD.pdf`, alias = `<old prompt slug>-report.pdf`.
 * Falls back to `report-YYYY-MM-DD.pdf` when the answer has no usable heading or sentence (never the prompt).
 */
export function reportFileName(answerMarkdown: string, prompt: string, date: Date = new Date()): { name: string; alias: string } {
  const title = titleFromMarkdown(answerMarkdown);
  const slug = slugify(title) || "report";
  return { name: `${slug}-${isoDay(date)}.pdf`, alias: `${promptSlug(prompt)}-report.pdf` };
}
