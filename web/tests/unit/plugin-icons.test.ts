/**
 * plugin-icons.test.ts — pluginIconFor(): brand mark for the Portfolio Plugin, local svgs for Perplexity/OnDemand, monogram fallback.
 *   cd web && npm run test:plugin-icons   (= node ../node_modules/tsx/dist/cli.mjs tests/unit/plugin-icons.test.ts)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_MARK_SRC, MONOGRAM_BG, ONDEMAND_ICON_SRC, PERPLEXITY_ICON_SRC, isLocalIcon, monogramLetter, pluginIconFor } from "../../src/lib/plugin-icons";

let pass = 0; const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
const pub = (p: string) => join(__dirname, "..", "..", "public", p);

console.log("plugin-icons: Portfolio Plugin → B Capital mark");
const portfolio = pluginIconFor("plugin-1791713636", "Portfolio Plugin", "https://cdn.example/x.png");
eq("portfolio id → kind brand", portfolio.kind, "brand");
eq("portfolio id → brand src", portfolio.src, BRAND_MARK_SRC);
eq("portfolio by name (unknown id) → brand", pluginIconFor("plugin-999", "B Capital Portfolio").kind, "brand");
check("portfolio never a grey P", portfolio.kind !== "monogram" && portfolio.letter === undefined, portfolio);
check("brand mark PNG exists", existsSync(pub(BRAND_MARK_SRC)));
check("brand mark is a PNG (magic bytes)", readFileSync(pub(BRAND_MARK_SRC)).subarray(1, 4).toString() === "PNG");

console.log("plugin-icons: Perplexity → local svg");
const px = pluginIconFor("plugin-1722260873", "Perplexity");
eq("perplexity id → kind local", px.kind, "local");
eq("perplexity id → /plugins/perplexity.svg", px.src, PERPLEXITY_ICON_SRC);
eq("perplexity by name → local svg", pluginIconFor("plugin-1", "Perplexity Search").src, PERPLEXITY_ICON_SRC);
const pxSvg = existsSync(pub(PERPLEXITY_ICON_SRC)) ? readFileSync(pub(PERPLEXITY_ICON_SRC), "utf8") : "";
check("perplexity.svg exists, 24×24, 2px charcoal stroke", /viewBox="0 0 24 24"/.test(pxSvg) && /stroke="#1F2937"/.test(pxSvg) && /stroke-width="2"/.test(pxSvg));
check("perplexity.svg embeds no bitmap", !/<image|data:image|base64/i.test(pxSvg));

console.log("plugin-icons: OnDemand agent → local svg");
eq("executePrompt → ondemand.svg", pluginIconFor("executePrompt").src, ONDEMAND_ICON_SRC);
eq("'Terminal agent' name → ondemand.svg", pluginIconFor("agent-1", "Terminal agent").src, ONDEMAND_ICON_SRC);
eq("OnDemand kind local", pluginIconFor("executePrompt").kind, "local");
const odSvg = existsSync(pub(ONDEMAND_ICON_SRC)) ? readFileSync(pub(ONDEMAND_ICON_SRC), "utf8") : "";
check("ondemand.svg exists, 24×24, green #0AC985 ring", /viewBox="0 0 24 24"/.test(odSvg) && /#0AC985/i.test(odSvg) && /<circle/.test(odSvg) && /<rect[^>]*rx=/.test(odSvg));

console.log("plugin-icons: everything else → remote chain, monogram fallback");
const remote = pluginIconFor("plugin-1716372717", "Tiktok", "https://cdn.example/cb.png"); // Tiktok: no brand icon → remote chain
eq("remote src kept", remote, { kind: "remote", src: "https://cdn.example/cb.png", alt: "Tiktok" });
const mono = pluginIconFor("plugin-424242", "Zeta Tools");
eq("unknown without remote → monogram", mono.kind, "monogram");
eq("monogram letter = first letter of name", mono.letter, "Z");
eq("monogram bg #F3F4F6", mono.bg, MONOGRAM_BG);
eq("monogram from bare id strips plugin- prefix", pluginIconFor("plugin-77").letter, "7");
eq("monogramLetter('') → ?", monogramLetter(""), "?");
eq("isLocalIcon brand/local true, remote/monogram false", [isLocalIcon(portfolio), isLocalIcon(px), isLocalIcon(remote), isLocalIcon(mono)], [true, true, false, false]);

console.log("plugin-icons: 2026-10-11 brand icon set → local /brand/icons/*.png for mapped tools");
const stock = pluginIconFor("plugin-1716429542", "US Stock Fundamental Analysis", "https://cdn.example/x.png");
eq("US Stock plugin → local stock-market icon (beats remote favicon)", stock, { kind: "local", src: "/brand/icons/icon-stock-market.png", alt: "US Stock Fundamental Analysis" });
eq("GPT Search → research-search icon", pluginIconFor("plugin-1741871229", "GPT Search").src, "/brand/icons/icon-research-search.png");
eq("PitchBook → compare icon", pluginIconFor("plugin-1777018662", "Pitchbook Investor Finder").src, "/brand/icons/icon-compare.png");
eq("name rule: 'Market data' → stock-market", pluginIconFor("plugin-5", "Market data").src, "/brand/icons/icon-stock-market.png");
check("every brand icon PNG exists and starts with the PNG magic", ["writer-compose","research-search","compare","stock-market","fervo-geothermal","portfolio-listing","agent","autonomous-mobility","news-sentiment","payments-fintech"].every((n) => { const f = pub(`/brand/icons/icon-${n}.png`); return existsSync(f) && readFileSync(f).subarray(1, 4).toString() === "PNG"; }));
check("Portfolio Plugin still draws the B Capital mark, not a brand icon", pluginIconFor("plugin-1791713636", "Portfolio Plugin").src === BRAND_MARK_SRC);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("Failures:\n  - " + failures.join("\n  - ")); process.exit(1); }
