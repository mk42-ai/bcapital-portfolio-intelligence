/**
 * sparkline.test.ts — pure-helper tests for the dependency-free SVG Sparkline (a23). Run with tsx (no framework):
 *   cd web && npm run test:sparkline   (= node ../node_modules/tsx/dist/cli.mjs tests/unit/sparkline.test.ts)
 * Exits non-zero on any failure.
 */
import { sparklinePath, sparklinePoints, sparklineAreaPath, sparklineSummary, cleanValues } from "../../src/components/charts/sparkline";

let pass = 0; const failures: string[] = [];
function ok(cond: boolean, msg: string) { if (cond) pass++; else failures.push(msg); }
function eq<T>(a: T, b: T, msg: string) { ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }

const W = 120, H = 28, P = 2;

// 1. empty → ""
eq(sparklinePath([], W, H, P), "", "empty series yields empty path");
eq(sparklinePoints([], W, H, P).length, 0, "empty series yields no points");

// 2. single point → no line, centre dot only
eq(sparklinePath([0.5], W, H, P), "", "single point yields no polyline");
eq(sparklinePoints([0.5], W, H, P), [{ x: 60, y: 14 }], "single point sits at the box centre");

// 3. three monotonic points → exactly 2 segments (M + 2 L)
const mono = sparklinePath([0.1, 0.2, 0.3], W, H, P);
ok(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/.test(mono), `3 points produce M + 2 L segments: ${mono}`);
eq((mono.match(/L/g) ?? []).length, 2, "3 points → 2 L segments");

// 4. normalisation: min at bottom pad, max at top pad, x spans pad..w-pad
const pts = sparklinePoints([0.1, 0.2, 0.3], W, H, P);
eq(pts[0], { x: 2, y: 26 }, "first/min point at (pad, h-pad)");
eq(pts[2], { x: 118, y: 2 }, "last/max point at (w-pad, pad)");
eq(pts[1].y, 14, "middle point at vertical centre");

// 5. flat series → centre line
const flat = sparklinePoints([0.4, 0.4, 0.4, 0.4], W, H, P);
ok(flat.every((p) => p.y === 14), "flat series sits on the centre line");

// 6. NaN / Infinity / null filtered
eq(cleanValues([0.1, NaN, 0.3, Infinity, null, undefined, -0.2]), [0.1, 0.3, -0.2], "non-finite values filtered");
eq(sparklinePoints([NaN, 0.1, NaN, 0.3], W, H, P).length, 2, "NaN samples dropped before plotting");
eq(sparklinePath([NaN, NaN], W, H, P), "", "all-NaN series yields empty path");

// 7. descending series flips vertically
const desc = sparklinePoints([0.3, 0.1], W, H, P);
ok(desc[0].y < desc[1].y, "descending series starts high and ends low");

// 8. area path closes to the baseline
const area = sparklineAreaPath([0.1, 0.3], W, H, P);
ok(area.endsWith(" Z") && area.includes(` ${H - P} `), `area path closes along the baseline: ${area}`);
eq(sparklineAreaPath([0.1], W, H, P), "", "area path empty for single point");

// 9. accessible summary
eq(sparklineSummary([]), "No data", "summary for empty");
eq(sparklineSummary([0.5]), "Single value 0.50", "summary for single value");
eq(sparklineSummary([0.1, 0.2, 0.34]), "3 points, 0.10 to 0.34, change +0.24", "summary first → last + delta");
ok(sparklineSummary([0.5, 0.25]).includes("change −0.25"), "negative delta uses minus sign");

// 10. padding respected with custom pad
const padded = sparklinePoints([0, 1], 100, 20, 5);
eq(padded, [{ x: 5, y: 15 }, { x: 95, y: 5 }], "custom pad honoured");

if (failures.length) { console.error(`sparkline: ${failures.length} failed, ${pass} passed`); for (const f of failures) console.error(" ✗ " + f); process.exit(1); }
console.log(`sparkline: ${pass} assertions passed`);
