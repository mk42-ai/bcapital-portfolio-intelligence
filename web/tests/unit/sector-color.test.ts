/**
 * sector-color.test.ts — a18 sector tokens: no blue hue (hue-audit rule), WCAG AA contrast, deterministic fallback, CSS parity.
 *   cd web && npm run test:sector-color   (= node ../node_modules/tsx/dist/cli.mjs tests/unit/sector-color.test.ts)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBlueHue, rgbToHsl, parseCssColor } from "../../src/lib/hue-audit";
import { SECTORS } from "../../src/lib/format";
import { SECTOR_PALETTE, SECTOR_SWATCH, SECTOR_NAMES, sectorColor, sectorSlug, sectorChipStyle } from "../../src/lib/sector-color";

let pass = 0; const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };

// WCAG 2.2 relative luminance / contrast computed here (independent of src/lib/color.ts).
const lum = (hex: string) => { const c = parseCssColor(hex)!; const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const contrast = (a: string, b: string) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const hueOf = (hex: string) => { const c = parseCssColor(hex)!; return rgbToHsl(c.r, c.g, c.b); };

console.log("sector-color: palette hue audit (no blue 190–260°)");
for (const p of SECTOR_PALETTE) for (const k of ["fill", "ink", "soft"] as const) {
  const hex = p[k]; const [h, s] = hueOf(hex);
  check(`${p.name}.${k} ${hex} not blue (hue ${h.toFixed(0)}°, sat ${s.toFixed(2)})`, !isBlueHue(hex), { h, s });
}

console.log("sector-color: WCAG AA contrast");
for (const p of SECTOR_PALETTE) {
  const w = contrast(p.ink, "#ffffff"), sft = contrast(p.ink, p.soft);
  check(`${p.name} ink on white ${w.toFixed(2)}:1 ≥ 4.5`, w >= 4.5);
  check(`${p.name} ink on soft ${sft.toFixed(2)}:1 ≥ 4.5`, sft >= 4.5);
  check(`${p.name} soft is a light tint (lum ≥ 0.7)`, lum(p.soft) >= 0.7, lum(p.soft));
}

console.log("sector-color: known sectors");
const names = new Set(SECTOR_PALETTE.map((p) => p.name));
check("palette names unique", names.size === SECTOR_PALETTE.length);
check("primary swatch is brand emerald #0AC985/#047857", SECTOR_PALETTE[0].fill === "#0AC985" && SECTOR_PALETTE[0].ink === "#047857");
check("Technology → emerald (brand)", sectorColor("Technology").swatch === "emerald");
for (const s of SECTORS) { const c = sectorColor(s); check(`${s} known → slug ${c.slug}, swatch ${c.swatch}`, c.known && names.has(c.swatch) && c.var === `var(--sector-${sectorSlug(s)})`); }
check("snapshot extra sector 'Venture Capital (firm)' is mapped", sectorColor("Venture Capital (firm)").known);
check("every SECTOR_SWATCH entry points at a palette swatch", Object.values(SECTOR_SWATCH).every((n) => names.has(n)));
const used = [...SECTORS, "Venture Capital (firm)"].map((s) => sectorColor(s).swatch);
check("distinct swatches across all known sectors", new Set(used).size === used.length, used);
try {
  const snap = JSON.parse(readFileSync(resolve(__dirname, "../../src/data/snapshot.json"), "utf8")) as { companies?: { sector?: string }[] };
  const snapSectors = [...new Set((snap.companies ?? []).map((c) => c.sector).filter((x): x is string => !!x))];
  check(`all snapshot sectors known (${snapSectors.length})`, snapSectors.every((s) => sectorColor(s).known), snapSectors.filter((s) => !sectorColor(s).known));
} catch (e) { check("snapshot.json readable", false, String(e)); }

console.log("sector-color: unknown-sector fallback");
const unk = ["Fintech", "Climate", "Consumer", "Industrials", "Deep Tech", "Crypto"];
for (const u of unk) {
  const a = sectorColor(u), b = sectorColor(u);
  check(`${u} fallback stable + not blue + not known`, !a.known && a.fill === b.fill && a.ink === b.ink && a.soft === b.soft && !isBlueHue(a.fill) && !isBlueHue(a.ink) && !isBlueHue(a.soft) && names.has(a.swatch));
}
check("fallback never uses the brand emerald or slate", unk.every((u) => !["emerald", "slate"].includes(sectorColor(u).swatch)));
check("fallback case/whitespace insensitive", sectorColor(" fintech ").fill === sectorColor("Fintech").fill);
check("fallback spreads across the pool", new Set(unk.map((u) => sectorColor(u).swatch)).size >= 3);
check("null/empty → Other (slate)", sectorColor(null).swatch === "slate" && sectorColor("").slug === "other" && sectorColor(undefined).ink === "#44403C");
check("sectorSlug('Energy & Resilience') = energy-resilience", sectorSlug("Energy & Resilience") === "energy-resilience");
check("sectorSlug('Venture Capital (firm)') = venture-capital-firm", sectorSlug("Venture Capital (firm)") === "venture-capital-firm");
const st = sectorChipStyle("Healthcare");
check("sectorChipStyle = soft bg + ink text + 40% fill border", st.background === "#FAE8FF" && st.color === "#701A75" && st.border === "1px solid #A21CAF66");

console.log("sector-color: tokens.css parity");
const css = readFileSync(resolve(__dirname, "../../src/styles/tokens.css"), "utf8");
check("tokens.css has the a18 block", css.includes("/* a18 sector tokens */") && css.includes("/* end a18 */"));
for (const p of SECTOR_PALETTE) {
  const re = (k: string, v: string) => new RegExp(`--sector-${p.name}${k}:\\s*${v}\\s*;`, "i");
  check(`css --sector-${p.name}[-ink|-soft] match palette`, re("", p.fill).test(css) && re("-ink", p.ink).test(css) && re("-soft", p.soft).test(css));
}
for (const s of SECTOR_NAMES) {
  const slug = sectorSlug(s), sw = sectorColor(s).swatch;
  check(`css --sector-${slug} → var(--sector-${sw})`, new RegExp(`--sector-${slug}:\\s*var\\(--sector-${sw}\\)`).test(css) && css.includes(`--sector-${slug}-ink:`) && css.includes(`--sector-${slug}-soft:`));
  check(`css .chip-sector[data-sector="${s}"] rule`, css.includes(`.chip-sector[data-sector="${s}"]`));
}
const cssHexes = [...css.slice(css.indexOf("/* a18 sector tokens */")).matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0]);
check(`no blue hex anywhere in the a18 css block (${cssHexes.length} hexes)`, cssHexes.every((h) => !isBlueHue(h)), cssHexes.filter((h) => isBlueHue(h)));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:", failures); process.exit(1); }
