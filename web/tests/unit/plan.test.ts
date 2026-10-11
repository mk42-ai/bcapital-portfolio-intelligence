/**
 * plan.test.ts — the Plan card never shows raw planner JSON or operationIds. Run with tsx (no framework):
 *   cd web && npm run test:plan      (= node ../node_modules/tsx/dist/cli.mjs tests/unit/plan.test.ts)
 * Exits non-zero on any failure.
 */
import { friendlyStepTitle, looksLikeJson, looksLikeOperationId, sanitizeObjective, sanitizePlan } from "../../src/lib/ondemand/plan";

let pass = 0; const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); } };
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const RAW = '{"title":"Portfolio overview","objective":"I will list the portfolio companies and summarise them","plan_required":true,"steps":[{"id":1,"title":"listPortfolioCompanies","user_query":"[List companies] list every portfolio company","plugins":["plugin-1791713636"]},{"step_id":2,"name":"getCompanyNews"}]}';

console.log("plan: objective guard");
eq("JSON-looking objective → \"\"", sanitizeObjective(RAW), "");
eq("objective starting with [ → \"\"", sanitizeObjective('[{"a":1}]'), "");
eq("objective containing \"plan_required\" → \"\"", sanitizeObjective('plan \"plan_required\": true'), "");
eq("plain sentence passes through (markdown stripped)", sanitizeObjective("**I will** compare the five companies"), "I will compare the five companies");
check("long objective clamped with ellipsis", /\.\.\.$/.test(sanitizeObjective(Array.from({ length: 40 }, (_, i) => `w${i}`).join(" "))));
check("looksLikeJson detects fenced json", looksLikeJson("```json\n{}"));

console.log("plan: step titles");
eq("camelCase operationId → friendly", friendlyStepTitle("listPortfolioCompanies"), "List portfolio companies");
eq("snake_case operationId → friendly", friendlyStepTitle("get_company_news"), "Get company news");
eq("PascalCase operationId → friendly", friendlyStepTitle("GetSentimentScores"), "Get sentiment scores");
eq("sentence untouched", friendlyStepTitle("Summarise the latest news"), "Summarise the latest news");
eq("[Title] query → Title", friendlyStepTitle("[List companies] list every company"), "List companies");
eq("JSON step title → extracted title", friendlyStepTitle('{"title":"fetchNews","user_query":"x"}'), "Fetch news");
eq("pure JSON with no title → \"\"", friendlyStepTitle('{"plan_required":true}'), "");
check("single lowercase word is NOT an operationId", !looksLikeOperationId("news"));

console.log("plan: sanitizePlan frame");
const p = sanitizePlan(JSON.parse(RAW));
eq("objective is the first-person sentence", p.objective, "I will list the portfolio companies and summarise them");
eq("steps carry only id/title/query/plugins", Object.keys(p.steps[0]).sort(), ["id", "plugins", "query", "title"]);
eq("step 1 title friendly", p.steps[0].title, "List portfolio companies");
eq("step 1 query from user_query sans [tag]", p.steps[0].query, "list every portfolio company");
eq("step 2 id from step_id, title from name", { id: p.steps[1].id, title: p.steps[1].title }, { id: "2", title: "Get company news" });
check("raw JSON string never appears in the frame", !JSON.stringify(p).includes("plan_required"));
eq("objective that is itself the raw JSON → \"\" + steps kept", sanitizePlan({ objective: RAW, steps: ["doThing"] }), { objective: "", steps: [{ id: "1", title: "Do thing" }] });
eq("garbage input → empty plan", sanitizePlan("nope"), { objective: "", steps: [] });
eq("title fallback when objective missing", sanitizePlan({ title: "Compare peers" }).objective, "Compare peers");

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
