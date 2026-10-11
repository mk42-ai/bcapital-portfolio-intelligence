import "server-only";
import zlib from "node:zlib";

/**
 * Dependency-free local text extraction, used ONLY when OnDemand media create fails upstream (e.g. HTTP 500 `errors.server_error`
 * or the blob URL is unreachable from OnDemand). Results are labelled `grounded: "local"` so the UI never pretends OnDemand processed the file.
 *  - DOCX: reads the ZIP central directory, inflates word/document.xml, keeps <w:t> runs, paragraph breaks on </w:p>.
 *  - PDF : inflates every FlateDecode stream and collects string operands of Tj / TJ text operators (good for generated PDFs; scans yield "").
 */
export function extractDocx(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return "";
  const count = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && off + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10); const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28); const xlen = buf.readUInt16LE(off + 30); const clen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42); const name = buf.subarray(off + 46, off + 46 + nlen).toString("utf8");
    off += 46 + nlen + xlen + clen;
    if (name !== "word/document.xml") continue;
    const lnlen = buf.readUInt16LE(local + 26); const lxlen = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
    const xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    return xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, "\u0001$1\u0002").replace(/<[^>]+>/g, "")
      .replace(/\u0002\u0001/g, "").replace(/[\u0001\u0002]/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n").trim();
  }
  return "";
}

const unescapePdf = (s: string) => s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, c: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" } as Record<string, string>)[c] ?? String.fromCharCode(parseInt(c, 8)));
export function extractPdf(bytes: Uint8Array, max = 200_000): string {
  const buf = Buffer.from(bytes); const out: string[] = []; let total = 0;
  const latin = buf.toString("latin1");
  const re = /stream\r?\n/g; let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) && total < max) {
    const start = m.index + m[0].length; const end = latin.indexOf("endstream", start); if (end < 0) break;
    const dict = latin.slice(Math.max(0, m.index - 300), m.index);
    let content = "";
    try { content = /FlateDecode/.test(dict) ? zlib.inflateSync(buf.subarray(start, end)).toString("latin1") : /Filter/.test(dict) ? "" : latin.slice(start, end); } catch { content = ""; }
    re.lastIndex = end;
    if (!/T[Jj]/.test(content)) continue;
    const lines: string[] = [];
    for (const t of content.matchAll(/\[((?:\([^)]*(?:\\\)[^)]*)*\)|[^\]])*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj|(T\*|ET)/g)) {
      if (t[3]) { lines.push("\n"); continue; }
      if (t[2] != null) lines.push(unescapePdf(t[2]));
      else if (t[1] != null) lines.push([...t[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map((x) => unescapePdf(x[1])).join(""));
    }
    const txt = lines.join("").replace(/[^\S\n]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    if (txt) { out.push(txt); total += txt.length; }
  }
  return out.join("\n\n").slice(0, max).trim();
}
