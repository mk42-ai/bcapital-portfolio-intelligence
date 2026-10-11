/**
 * naming.test.ts — report file names derived from the answer markdown, never the prompt. Run with tsx (no framework):
 *   cd web && npm run test:naming      (= node ../node_modules/tsx/dist/cli.mjs tests/unit/naming.test.ts)
 * Exits non-zero on any failure.
 */
import { reportFileName, slugify, titleFromMarkdown } from "../../src/lib/artifacts/naming";

let pass = 0; const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const DATE = new Date("2026-10-11T10:00:00Z");
const PROMPT = "create me a docuemnt on all of these companies";

console.log("naming: H1-derived file names");
eq("H1 → portfolio-summary-2026-10-11.pdf", reportFileName("# Portfolio Summary\n\nSome text.", PROMPT, DATE).name, "portfolio-summary-2026-10-11.pdf");
eq("H1 with trailing hashes / emphasis", reportFileName("#  **Portfolio Summary** ##\nbody", PROMPT, DATE).name, "portfolio-summary-2026-10-11.pdf");
eq("H2 when there is no H1", reportFileName("Intro line.\n\n## Fervo Energy vs. Ormat Technologies\n- a\n- b", PROMPT, DATE).name, "fervo-energy-vs-ormat-technologies-2026-10-11.pdf");
eq("H1 wins over an earlier H2", reportFileName("## Overview\n# Q3 LP Update\n", PROMPT, DATE).name, "q3-lp-update-2026-10-11.pdf");
eq("no heading → first sentence (≤ 8 words)", reportFileName("Fervo Energy raised a new round this quarter, led by existing investors. More text follows.", PROMPT, DATE).name, "fervo-energy-raised-new-round-this-quarter-2026-10-11.pdf");
eq("stop words a/an/the/me/on/of/for stripped", reportFileName("# The State of the Portfolio for an LP", PROMPT, DATE).name, "state-portfolio-lp-2026-10-11.pdf");
check("slug ≤ 48 chars", slugify("# " + Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ")).length <= 48, slugify(Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ")));
eq("ascii + lowercase + hyphens", slugify("Résumé — Café & Ñandú 2026!"), "resume-cafe-nandu-2026");
eq("empty answer → report-<date>.pdf (never the prompt)", reportFileName("", PROMPT, DATE).name, "report-2026-10-11.pdf");
eq("bullets-only answer → report-<date>.pdf", reportFileName("- one\n- two\n", PROMPT, DATE).name, "report-2026-10-11.pdf");
const r = reportFileName("# Portfolio Summary", PROMPT, DATE);
check("prompt typo never leaks into the name", !/docuemnt|create-me/.test(r.name), r);
eq("alias = the legacy prompt slug + -report.pdf", r.alias, "create-me-a-docuemnt-on-all-report.pdf");
eq("date is UTC day of the run", reportFileName("# X", PROMPT, new Date("2026-12-31T23:59:59Z")).name, "x-2026-12-31.pdf");
eq("titleFromMarkdown: link + code cleaned", titleFromMarkdown("# [Fervo](https://x) `report`"), "Fervo report");

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
