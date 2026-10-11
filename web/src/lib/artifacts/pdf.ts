/** Dependency-free minimal PDF writer (PDF 1.4, A4, Helvetica / Helvetica-Bold, word wrap, multi-page, correct xref). */
export type PdfSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type PdfDoc = { title: string; subtitle?: string; sections: PdfSection[]; footer?: string };

const W = 595, H = 842, M = 50, BOTTOM = 60;
type Line = { text: string; font: "F1" | "F2"; size: number; x: number; gapBefore: number; color?: string };

/** Map to WinAnsi-safe Latin-1 and escape ( ) \ for a PDF literal string. */
function esc(s: string): string {
  const norm = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/\u2022/g, "-").replace(/\u00A0/g, " ");
  let out = "";
  for (const ch of norm) {
    const c = ch.codePointAt(0)!;
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c < 32) out += " ";
    else if (c > 255) out += "?";
    else if (c > 126) out += "\\" + c.toString(8).padStart(3, "0");
    else out += ch;
  }
  return out;
}
/** Greedy wrap by approximate character width (Helvetica ~0.5em avg). */
function wrap(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = []; let cur = "";
  for (let w of words) {
    while (w.length > maxChars) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, maxChars)); w = w.slice(maxChars); }
    if (!cur) cur = w; else if ((cur + " " + w).length <= maxChars) cur += " " + w; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
const charsFor = (size: number, indent = 0) => Math.max(20, Math.floor(((W - 2 * M - indent) / (size * 0.5)) * (size <= 10.5 ? 0.98 : 0.95)));

export function makeTextPdf(doc: PdfDoc): Uint8Array {
  const lines: Line[] = [];
  for (const [i, t] of wrap(doc.title, charsFor(20)).entries()) lines.push({ text: t, font: "F2", size: 20, x: M, gapBefore: i ? 4 : 0 });
  if (doc.subtitle) for (const [i, t] of wrap(doc.subtitle, charsFor(11)).entries()) lines.push({ text: t, font: "F1", size: 11, x: M, gapBefore: i ? 2 : 8, color: "0.36 0.38 0.41" });
  for (const s of doc.sections) {
    for (const [i, t] of wrap(s.heading, charsFor(14)).entries()) lines.push({ text: t, font: "F2", size: 14, x: M, gapBefore: i ? 2 : 18 });
    for (const p of s.paragraphs) for (const [i, t] of wrap(p, Math.min(90, charsFor(10.5))).entries()) lines.push({ text: t, font: "F1", size: 10.5, x: M, gapBefore: i ? 0 : 7 });
    for (const b of s.bullets ?? []) for (const [i, t] of wrap(b, Math.min(86, charsFor(10.5, 14))).entries()) lines.push({ text: i ? t : `-  ${t}`, font: "F1", size: 10.5, x: i ? M + 12 : M, gapBefore: i ? 0 : 4 });
  }
  // paginate
  const pages: string[] = []; let ops: string[] = []; let y = H - M;
  const flush = () => { pages.push(ops.join("\n")); ops = []; y = H - M; };
  for (const l of lines) {
    const lh = l.size * 1.35;
    if (y - l.gapBefore - lh < BOTTOM && ops.length) flush();
    y -= (ops.length ? l.gapBefore : 0) + lh;
    ops.push(`BT ${l.color ?? "0.07 0.09 0.15"} rg /${l.font} ${l.size} Tf ${l.x} ${y.toFixed(2)} Td (${esc(l.text)}) Tj ET`);
  }
  flush();
  const n = pages.length;
  if (doc.footer || n > 1) pages.forEach((_, i) => {
    const f = `${doc.footer ? doc.footer + "  -  " : ""}Page ${i + 1} of ${n}`;
    pages[i] += `\nBT 0.42 0.45 0.5 rg /F1 8 Tf ${M} 30 Td (${esc(f)}) Tj ET`;
  });

  // objects: 1 catalog, 2 pages, 3 F1, 4 F2, then (page, content) pairs
  const enc = new TextEncoder();
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((content, i) => {
    const p = 5 + i * 2;
    objs[p] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${p + 1} 0 R >>`;
    objs[p + 1] = `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`;
  });
  const parts: string[] = ["%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n"];
  // header bytes: use latin1 encoding for the binary comment
  const chunks: Uint8Array[] = []; let off = 0;
  const push = (s: string, latin1 = false) => { const b = latin1 ? Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff) : enc.encode(s); chunks.push(b); off += b.length; };
  push(parts[0], true);
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) { offsets[i] = off; push(`${i} 0 obj\n${objs[i]}\nendobj\n`); }
  const xref = off;
  let x = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) x += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  x += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Title (${esc(doc.title)}) /Producer (B Capital Portfolio Intelligence) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  push(x);
  const out = new Uint8Array(off); let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
