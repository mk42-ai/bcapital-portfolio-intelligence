/**
 * citations.test.ts — pure-function tests for the streaming citation parser (Agent 9). Run with tsx (no framework):
 *   cd web && node ../node_modules/tsx/dist/cli.mjs tests/unit/citations.test.ts
 * Exits non-zero on any failure.
 */
import { extractCitations, trimUrl, citeKey, isCiteLabel, type Cite } from "../../src/components/chat/open-intelligent-ui/citations";

let pass = 0; const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
const chips = (md: string) => [...md.matchAll(/\[⟦(\d+)⟧\]\(([^)]+)\)/g)].map((m) => [Number(m[1]), m[2]] as const);

console.log("citations: markdown link");
{
  const r = extractCitations("Fervo raised $255M ([TechCrunch](https://techcrunch.com/2024/02/fervo)).");
  eq("one cite, url kept", r.cites.map((c) => c.url), ["https://techcrunch.com/2024/02/fervo"]);
  eq("label becomes the title", r.cites[0].title, "TechCrunch");
  eq("sourceName = host", r.cites[0].sourceName, "techcrunch.com");
  eq("label stays in prose + chip link", chips(r.md), [[1, "https://techcrunch.com/2024/02/fervo"]]);
  check("prose label preserved", r.md.includes("TechCrunch [⟦1⟧]"), r.md);
}
console.log("citations: bare URL");
{
  const r = extractCitations("See https://example.org/b for details.");
  eq("bare url → cite", r.cites.map((c) => c.url), ["https://example.org/b"]);
  eq("title falls back to host", r.cites[0].title, "example.org");
  eq("chip inserted", chips(r.md), [[1, "https://example.org/b"]]);
}
console.log("citations: [n] markers resolve to the known (plugin) list");
{
  const known: Cite[] = [
    { url: "https://example.com/a", title: "Example A", sourceName: "example.com", imageUrl: "https://example.com/a.png" },
    { url: "https://example.net/c", title: "Example C", sourceName: "example.net" },
  ];
  const r = extractCitations("Claim one [1]. Claim two [2]. Claim three [1].", known, true);
  eq("[1]/[2] → known urls, in text order", r.cites.map((c) => c.url), ["https://example.com/a", "https://example.net/c"]);
  eq("imageUrl enrichment kept", r.cites[0].imageUrl, "https://example.com/a.png");
  eq("markers rewritten (repeat [1] reuses n=1)", chips(r.md), [[1, "https://example.com/a"], [2, "https://example.net/c"], [1, "https://example.com/a"]]);
  const unresolved = extractCitations("Claim [3] and [1].", known);
  check("out-of-range [3] stays literal", unresolved.md.includes("[3]"), unresolved.md);
  const none = extractCitations("Claim [1].", []);
  eq("no known list yet → marker left as-is, zero cites", [none.md, none.cites.length], ["Claim [1].", 0]);
}
console.log("citations: text first, then plugin sources never mentioned");
{
  const known: Cite[] = [{ url: "https://plugin.example/x", title: "Plugin X", sourceName: "plugin.example" }, { url: "https://example.org/b", title: "Known B", sourceName: "example.org" }];
  const r = extractCitations("Text cites https://example.org/b only.", known);
  eq("text url is #1 (title enriched from plugin), unmentioned plugin source appended as #2", r.cites.map((c) => [c.url, c.title]), [["https://example.org/b", "Known B"], ["https://plugin.example/x", "Plugin X"]]);
}
console.log("citations: dedupe same URL");
{
  const r = extractCitations("A [x](https://example.com/a) B https://example.com/a C [1]", [{ url: "https://example.com/a/", title: "Example A", sourceName: "example.com" }]);
  eq("md link + bare + marker + plugin (trailing slash) → one cite", r.cites.length, 1);
  eq("all three references point at n=1", chips(r.md).map((c) => c[0]), [1, 1, 1]);
  eq("citeKey ignores trailing slash / fragment / case", citeKey("HTTPS://Example.com/a/#top"), citeKey("https://example.com/a"));
}
console.log("citations: trailing punctuation trimmed");
{
  const r = extractCitations("Read https://example.org/b. Then https://example.org/c, and (https://example.org/d).");
  eq("trailing . , ) trimmed", r.cites.map((c) => c.url), ["https://example.org/b", "https://example.org/c", "https://example.org/d"]);
  check("sentence punctuation kept in the prose", /⟧\]\(https:\/\/example\.org\/b\)\./.test(r.md), r.md);
  eq("trimUrl keeps balanced parens (wikipedia-style)", trimUrl("https://en.wikipedia.org/wiki/Fervo_(company))."), "https://en.wikipedia.org/wiki/Fervo_(company)");
}
console.log("citations: streaming partial link not emitted");
{
  const p1 = extractCitations("Per [TechCrunch](https://techcru", [], true);
  eq("half-typed md link → no cite", p1.cites.length, 0);
  check("half-typed md link text untouched", p1.md === "Per [TechCrunch](https://techcru", p1.md);
  const p2 = extractCitations("See https://example.org/partial-pa", [], true);
  eq("half-typed bare url → no cite", p2.cites.length, 0);
  const p3 = extractCitations("See https://example.org/partial-path ", [], true);
  eq("closed by whitespace → cite", p3.cites.map((c) => c.url), ["https://example.org/partial-path"]);
  const done = extractCitations("See https://example.org/partial-pa", [], false);
  eq("same text once streaming ended → cite", done.cites.length, 1);
}
console.log("citations: label sentinel");
{
  eq("isCiteLabel string", isCiteLabel("⟦4⟧"), 4);
  eq("isCiteLabel array children", isCiteLabel(["⟦", "12", "⟧"]), 12);
  eq("isCiteLabel other", isCiteLabel("TechCrunch"), null);
}

console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? `: ${failures.join(", ")}` : ""}`);
if (failures.length) process.exit(1);
