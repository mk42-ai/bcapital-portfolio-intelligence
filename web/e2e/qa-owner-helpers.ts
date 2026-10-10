import { expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/** Owner QA pass (2026-10-10): timestamped evidence screenshots + per-check JSON rows merged later into qa_results.json. */
export const EVIDENCE_DIR = process.env.QA_EVIDENCE_DIR || path.resolve(process.cwd(), "../../qa-evidence");
export const RESULTS_DIR = process.env.QA_RESULTS_DIR || path.resolve(process.cwd(), "../../qa");
export type QaRow = { check: string; viewport: string; status: "pass" | "fail" | "fixed" | "open"; evidence_url: string; timestamp_utc: string; detail?: string };

export const stamp = () => new Date().toISOString().replace(/[:.]/g, "").replace("T", "T").slice(0, 15) + "Z";
export const vpName = (page: Page) => { const v = page.viewportSize(); return v ? `${v.width}x${v.height}` : "unknown"; };

export async function shot(page: Page, check: string, name = ""): Promise<string> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = `${check}${name ? `-${name}` : ""}-${vpName(page)}-${stamp()}.png`;
  await page.screenshot({ path: path.join(EVIDENCE_DIR, file), fullPage: false });
  return file;
}
export function record(agent: string, row: QaRow) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const f = path.join(RESULTS_DIR, `qa-${agent}.json`);
  const cur: QaRow[] = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as QaRow[]) : [];
  cur.push(row); fs.writeFileSync(f, JSON.stringify(cur, null, 1));
}
/** Runs the check body; records pass/fail with the evidence file; rethrows so Playwright reports it too. */
export async function qaCheck(agent: string, page: Page, testInfo: TestInfo, check: string, body: () => Promise<string | void>) {
  const t = new Date().toISOString();
  try {
    const detail = await body();
    const file = await shot(page, check, "pass");
    record(agent, { check, viewport: vpName(page), status: "pass", evidence_url: `qa-evidence/${file}`, timestamp_utc: t, detail: detail || undefined });
    testInfo.annotations.push({ type: "qa", description: `${check} pass → ${file}` });
  } catch (e) {
    const file = await shot(page, check, "fail").catch(() => "");
    record(agent, { check, viewport: vpName(page), status: "fail", evidence_url: file ? `qa-evidence/${file}` : "", timestamp_utc: t, detail: String((e as Error).message).slice(0, 400) });
    throw e;
  }
}
/** Blue-hue predicate (HSL hue 190–260, saturation > 0.15, alpha > 0) over computed colours — same rule the owner specified. */
export const BLUE_SWEEP = `(() => { const bad = []; const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const M = Math.max(r, g, b), m = Math.min(r, g, b); let h = 0, s = 0; const l = (M + m) / 2; if (M !== m) { const d = M - m; s = l > .5 ? d / (2 - M - m) : d / (M + m); switch (M) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; } h *= 60; } return [h, s, l]; };
  for (const el of document.querySelectorAll('body *')) { if (el.closest('[data-hue-audit-ignore]') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue; const cs = getComputedStyle(el);
    for (const p of ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor']) { const m = cs[p].match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/); if (!m) continue; if (m[4] !== undefined && parseFloat(m[4]) === 0) continue; const [h, s] = hsl(+m[1], +m[2], +m[3]); if (h >= 190 && h <= 260 && s > 0.15) { bad.push(el.tagName + '.' + String(el.className).slice(0, 40) + ' ' + p + ' ' + cs[p]); if (bad.length >= 20) return bad; } } } return bad; })()`;
export { expect };
