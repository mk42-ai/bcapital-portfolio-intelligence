/**
 * url-state.test.ts — pure parse/serialize of the Companies URL state. Run with tsx (no framework):
 *   cd web && npm run test:url-state      (= node ../node_modules/tsx/dist/cli.mjs tests/unit/url-state.test.ts)
 * Exits non-zero on any failure. Only the pure functions are imported (the React hook in the same module is not executed).
 */
import { parseCompaniesState, serializeCompaniesState, COMPANIES_DEFAULTS, Q_MAX, type CompaniesUrlState } from "../../src/lib/url-state";

let pass = 0; const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
const P = (s: string) => parseCompaniesState(new URLSearchParams(s));

console.log("url-state: parse");
eq("empty → defaults", P(""), COMPANIES_DEFAULTS);
eq("all fields parsed", P("q=fervo&sector=Energy&sort=signal&view=grid&letter=f"), { q: "fervo", sector: "Energy", sort: "signal", view: "grid", letter: "F" });
eq("unknown sort → name", P("sort=bogus").sort, "name");
eq("unknown view → list", P("view=table").view, "list");
eq("sort/view case-insensitive", [P("sort=SIGNAL").sort, P("view=Grid").view], ["signal", "grid"]);
eq("sector is any string (kept verbatim, trimmed)", P("sector=%20Fintech%20%26%20Payments%20").sector, "Fintech & Payments");
eq("q trimmed", P("q=%20%20hello%20world%20%20").q, "hello world");
eq(`q capped at ${Q_MAX}`, P(`q=${"a".repeat(200)}`).q.length, Q_MAX);
eq("letter: only A–Z or # accepted", [P("letter=ab").letter, P("letter=%23").letter, P("letter=9").letter], ["", "#", ""]);
eq("order-independent parse", P("view=grid&q=x&sort=sector&sector=AI"), P("sector=AI&sort=sector&q=x&view=grid"));
eq("repeated keys → first wins (URLSearchParams.get)", P("sort=signal&sort=sector").sort, "signal");

console.log("url-state: serialize");
eq("defaults → empty string (clean /companies)", serializeCompaniesState(COMPANIES_DEFAULTS), "");
eq("partial state fills defaults and omits them", serializeCompaniesState({ sort: "name", view: "list" }), "");
eq("only non-defaults emitted", serializeCompaniesState({ q: "fervo", sort: "signal" }), "q=fervo&sort=signal");
eq("view=grid emitted, list omitted", [serializeCompaniesState({ view: "grid" }), serializeCompaniesState({ view: "list" })], ["view=grid", ""]);
eq("q trimmed + capped on serialize", serializeCompaniesState({ q: `  ${"b".repeat(100)}  ` }), `q=${"b".repeat(Q_MAX)}`);
eq("whitespace-only q/sector omitted", serializeCompaniesState({ q: "   ", sector: " " }), "");
eq("sector with spaces/ampersand encoded", serializeCompaniesState({ sector: "Fintech & Payments" }), "sector=Fintech+%26+Payments");
eq("invalid sort/view in state object are dropped", serializeCompaniesState({ sort: "zzz" as CompaniesUrlState["sort"], view: "x" as CompaniesUrlState["view"] }), "");

console.log("url-state: round trip");
const samples = ["", "q=fervo", "sort=signal", "view=grid", "sector=Energy&sort=sector", "q=a+b&sector=AI&sort=signal&view=grid&letter=A", "letter=%23"];
for (const s of samples) eq(`serialize(parse(x)) stable for "${s}"`, serializeCompaniesState(P(serializeCompaniesState(P(s)))), serializeCompaniesState(P(s)));
eq("parse(serialize(state)) === state", P(serializeCompaniesState({ q: "writer", sector: "Enterprise", sort: "sector", view: "grid", letter: "W" })), { q: "writer", sector: "Enterprise", sort: "sector", view: "grid", letter: "W" });
eq("noisy URL normalises to canonical", serializeCompaniesState(P("view=LIST&sort=NAME&q=%20&letter=zz&sector=")), "");

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.error("FAILED: " + failures.join(", ")); process.exit(1); }
