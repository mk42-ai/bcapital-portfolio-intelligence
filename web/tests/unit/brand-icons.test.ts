/**
 * brand-icons.test.ts — the 10 flat-line brand icons: files exist (PNG magic, 1024²), every mapping resolves to a shipped file,
 * the Portfolio Plugin keeps the B Capital mark, and the empty-state slots map as documented.
 *   cd web && npm run test:brand-icons
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_ICONS, BRAND_ICON_NAMES, EMPTY_STATE_BRAND_ICON, PLUGIN_BRAND_ICON, brandIconForCompany, brandIconForOperation, brandIconForPlugin, brandIconForStarter, brandIconPath } from "../../src/lib/brand-icons";
import { BRAND_MARK_SRC, pluginIconFor } from "../../src/lib/plugin-icons";

let pass = 0; const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
const pub = (p: string) => join(__dirname, "..", "..", "public", p);
const pngSize = (buf: Buffer) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

console.log("brand-icons: 10 files, PNG magic, 1024×1024");
eq("exactly 10 icons", BRAND_ICON_NAMES.length, 10);
for (const n of BRAND_ICON_NAMES) {
  const f = pub(brandIconPath(n));
  const ok = existsSync(f);
  const buf = ok ? readFileSync(f) : Buffer.alloc(0);
  check(`${n}: exists, PNG magic, 1024², >100 KB`, ok && buf.subarray(1, 4).toString() === "PNG" && pngSize(buf).w === 1024 && pngSize(buf).h === 1024 && buf.length > 100_000, ok ? pngSize(buf) : "missing");
  check(`${n}: path under /brand/icons/icon-*.png`, /^\/brand\/icons\/icon-[a-z-]+\.png$/.test(brandIconPath(n)));
  check(`${n}: has label/role/accent`, !!BRAND_ICONS[n].label && !!BRAND_ICONS[n].role && !!BRAND_ICONS[n].accent);
}

console.log("brand-icons: plugin mapping");
for (const [pid, icon] of Object.entries(PLUGIN_BRAND_ICON)) eq(`PLUGIN_BRAND_ICON ${pid} → ${icon}`, brandIconForPlugin(pid), icon);
eq("Perplexity → research-search", brandIconForPlugin("plugin-1722260873", "Perplexity"), "research-search");
eq("US Stock Technical → stock-market", brandIconForPlugin("plugin-1716434059"), "stock-market");
eq("executePrompt → agent", brandIconForPlugin("executePrompt"), "agent");
eq("name rule 'LinkedIn Search' → research-search", brandIconForPlugin("plugin-1718116202", "Linkedin Search"), "research-search");
eq("unknown 'Tiktok' → null (favicon chain)", brandIconForPlugin("plugin-1716372717", "Tiktok"), null);
eq("Portfolio Plugin keeps the B Capital mark", pluginIconFor("plugin-1791713636", "Portfolio Plugin").src, BRAND_MARK_SRC);

console.log("brand-icons: operation / company / starter / empty-state mapping");
eq("listPortfolioCompanies → portfolio-listing", brandIconForOperation("listPortfolioCompanies"), "portfolio-listing");
eq("getPortfolioCompanySentiment → news-sentiment", brandIconForOperation("getPortfolioCompanySentiment"), "news-sentiment");
eq("getCompanyNews → news-sentiment", brandIconForOperation("getCompanyNews"), "news-sentiment");
eq("unknown op → null", brandIconForOperation("doSomethingElse"), null);
eq("fervo-energy → fervo-geothermal", brandIconForCompany("fervo-energy"), "fervo-geothermal");
eq("flutterwave → payments-fintech", brandIconForCompany("flutterwave"), "payments-fintech");
eq("aimotive → autonomous-mobility", brandIconForCompany("aimotive"), "autonomous-mobility");
eq("writer → writer-compose", brandIconForCompany("writer"), "writer-compose");
eq("apptronik → agent", brandIconForCompany("apptronik"), "agent");
eq("sector fallback Fintech → payments-fintech", brandIconForCompany("some-co", "Fintech"), "payments-fintech");
eq("no match → null", brandIconForCompany("1au", "Opportunistic"), null);
eq("starter 'Compare two' → compare", brandIconForStarter("Compare two"), "compare");
eq("starter 'Biggest movers' → news-sentiment", brandIconForStarter("Biggest movers"), "news-sentiment");
eq("starter 'LP update draft' → writer-compose", brandIconForStarter("LP update draft"), "writer-compose");
eq("starter 'Latest Fervo news' → research-search", brandIconForStarter("Latest Fervo news"), "research-search");
eq("empty-state slots", EMPTY_STATE_BRAND_ICON, { "no-results": "research-search", "no-news": "news-sentiment", "no-selection": "compare", offline: null, "no-plugins": "agent" });
check("every mapped empty-state icon file exists", Object.values(EMPTY_STATE_BRAND_ICON).every((n) => n == null || existsSync(pub(brandIconPath(n)))));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("Failures:\n  - " + failures.join("\n  - ")); process.exit(1); }
