/**
 * Build / create / activate / execute the weekly PitchBook investor-finder workflow.
 *   tsx workflows/pitchbook-weekly.ts plan     → writes workflows/pitchbook-weekly.json (placeholder <INGEST_SECRET>, no API calls)
 *   tsx workflows/pitchbook-weekly.ts create   → POST /workflow (secret substituted in memory from INGEST_SECRET env) + /activate → workflows/pitchbook-created.json
 *   tsx workflows/pitchbook-weekly.ts execute  → POST /execute once and poll the execution logs (≤3 min) → appended to pitchbook-created.json
 * Env: ON_DEMAND_API_KEY (never printed), INGEST_SECRET (never written to disk), BACKEND_URL (default the Vercel sandbox), NOTIFY_EMAIL.
 * Plugin: plugin-1777018662 "Pitchbook Investor Finder" — the ONLY PitchBook plugin in the directory (proof/pitchbook/discovery.json).
 */
import fs from "node:fs";
import path from "node:path";

const MODEL = "predefined-deepseek-flash";
const CRON = "0 0 6 * * 1"; // Mon 06:00 UTC — 6-field (seconds first)
const PLUGIN = "plugin-1777018662";
const BASE = (process.env.ON_DEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
const BACKEND = (process.env.BACKEND_URL ?? "https://sb-4y5v8t21stuf.vercel.run").replace(/\/$/, "");
const SECRET = (process.env.INGEST_SECRET ?? "").trim() || "<INGEST_SECRET>";
const EMAIL = process.env.NOTIFY_EMAIL ?? "mk@airev.ae";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 bcap-portfolio-intelligence/1.0";
const NAME = "B Capital — PitchBook weekly enrichment";

const seed = JSON.parse(fs.readFileSync(path.resolve("data/seed.json"), "utf8"));
const all: { name: string; slug: string; sector: string; focus: boolean }[] = seed.companies.filter((c: any) => c.b_capital_role !== "firm").map((c: any) => ({ name: c.name, slug: c.slug, sector: c.sector, focus: !!c.is_focus }));
const focus = all.filter((c) => c.focus); const rest = all.filter((c) => !c.focus);
const line = (c: { name: string; slug: string; sector: string }) => `${c.name} [${c.slug}; ${c.sector}]`;

const prompt = `You are the B Capital PitchBook enrichment agent. The attached plugin is the PitchBook Investor Finder (operation searchInvestors): it takes a free-text fundraising brief and returns up to 10 enriched investor profiles from PitchBook. It has NO company-profile lookup — do not invent overview, valuation, financials or comparables.
For EACH company below: (1) build a brief in exactly this format —
Stage: <Seed / Series A-B / Growth (Series B+) / Public-PIPE>
Raise Size (USD): <range>
Investor types: <Venture Capital, Growth Equity, Corporate VC, Infrastructure funds … per sector>
Target geographies: <from HQ/region, else Global>
Ticket size range: <range>
What the company does: <name — sector; one sentence>
(2) call the PitchBook investor finder with that brief, (3) record every investor it returns with: name, website, location, year_founded, status, type, aum_musd (AUM in USD millions), dry_powder_musd, team_size, investment_range, deal_types[], industries[], verticals[], geographies[], preferences[]; unknown scalars = null, unknown lists = []. OUTPUT BUDGET: keep at most the 5 best-fit investors per company and at most 6 items per list (deal_types/industries/verticals/geographies/preferences) — a run with all companies must fit in one answer, so be compact (no whitespace/newlines between JSON tokens). Also record total_reported (the total number of results the plugin reported) and the brief you used.
FOCUS companies (do these first, never skip): ${focus.map(line).join("; ")}.
Other portfolio companies: ${rest.map(line).join("; ")}.
Return STRICT JSON only, no prose, no markdown fence: {"workflow_name":"${NAME}","records":[{"slug":"<slug>","investors":{"matched":[{"name":"","website":null,"location":null,"year_founded":null,"status":null,"type":null,"aum_musd":null,"dry_powder_musd":null,"team_size":null,"investment_range":null,"deal_types":[],"industries":[],"verticals":[],"geographies":[],"preferences":[]}],"brief":"<the brief>","total_reported":null}}]}. Use the exact slugs given in brackets. If the plugin returns nothing for a company, still include it with "matched":[] and "total_reported":0.`;

const body = {
  name: NAME,
  trigger: { type: "cron", cron: { expression: CRON, type: "advanced" }, nextNodeKeys: ["pitchbook"], position: { x: 0, y: 0 }, measured: { width: 300, height: 500 } },
  nodes: [
    { key: "pitchbook", kind: "source", type: "llm", dependencies: [], nextNodeKeys: ["analyzer-0"], position: { x: 100, y: 200 }, measured: { width: 300, height: 500 },
      llm: { model: MODEL, plugins: [{ id: PLUGIN }], fulfillmentPrompt: "You are the B Capital PitchBook enrichment agent. Use the attached PitchBook Investor Finder plugin (searchInvestors) for EVERY company listed, one brief per company. Output STRICT JSON only — the payload is POSTed verbatim to the backend /pitchbook/ingest endpoint which validates {records:[{slug, investors:{matched:[…], brief, total_reported}}]}.", prompt } },
    { key: "analyzer-0", kind: "sink", type: "o_analyzer", dependencies: [{ nodeKey: "pitchbook" }], nextNodeKeys: ["add-delivery"], position: { x: 500, y: 200 }, measured: { width: 300, height: 500 } },
  ],
  delivery: [
    { channel: "webhook", config: { webhook: { url: `${BACKEND}/pitchbook/ingest?secret=${SECRET}`, method: "POST", basicAuth: { username: "ingest", password: SECRET } } }, position: { x: 900, y: 200 }, measured: { width: 300, height: 500 } },
    { channel: "email", config: { email: { addresses: [EMAIL] } }, position: { x: 900, y: 800 }, measured: { width: 300, height: 500 } },
  ],
  enableMemory: true,
};
fs.writeFileSync("workflows/pitchbook-weekly.json", JSON.stringify(body, null, 2).replaceAll(SECRET, "<INGEST_SECRET>") + "\n");

/** Next Monday 06:00 UTC strictly after `from`. */
function nextMondayUtc(from = new Date()): string { const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 6)); let add = (1 - d.getUTCDay() + 7) % 7; if (add === 0 && d.getTime() <= from.getTime()) add = 7; d.setUTCDate(d.getUTCDate() + add); return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
const ts = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const scrub = (s: string) => (SECRET && SECRET !== "<INGEST_SECRET>" ? s.replaceAll(SECRET, "<INGEST_SECRET>") : s);
const OUT = "workflows/pitchbook-created.json";
const mode = process.argv[2] ?? "plan";
if (mode === "plan") { console.log(JSON.stringify({ name: NAME, cron: CRON, plugin: PLUGIN, companies: all.length, focus: focus.map((f) => f.slug), prompt_chars: prompt.length })); process.exit(0); }
const apikey = process.env.ON_DEMAND_API_KEY; if (!apikey) throw new Error("ON_DEMAND_API_KEY not set");
if (SECRET === "<INGEST_SECRET>") throw new Error("INGEST_SECRET not set — refusing to create a workflow with a placeholder secret");
const H = { apikey, "content-type": "application/json", "user-agent": UA };
const rec: any = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

if (mode === "create") {
  const r = await fetch(`${BASE}/automation/api/workflow/`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const txt = await r.text(); let j: any = {}; try { j = JSON.parse(txt); } catch { /* */ }
  const d = j.data ?? j; const id = d.id ?? d._id ?? d.workflowID ?? d.workflowId;
  Object.assign(rec, { id, name: NAME, cadence: `${CRON} (Mon 06:00 UTC)`, plugin_id: PLUGIN, model: MODEL, webhook_target: `${BACKEND}/pitchbook/ingest`, email: EMAIL, create_status: r.status, created_at: ts(), create_body: r.ok ? undefined : scrub(txt).slice(0, 500) });
  if (id) {
    const a = await fetch(`${BASE}/automation/api/workflow/${id}/activate`, { method: "POST", headers: H }); const at = await a.text();
    rec.activate_status = a.status; rec.active = a.ok; rec.activated_at = ts(); if (!a.ok) rec.activate_body = scrub(at).slice(0, 300);
    const g = await fetch(`${BASE}/automation/api/workflow/${id}`, { headers: H }); const gt = await g.text(); let gj: any = {}; try { gj = JSON.parse(gt); } catch { /* */ }
    const gd = gj.data ?? gj; rec.get_status = g.status;
    if (g.ok) { rec.active = gd.isActive ?? gd.active ?? gd.status === "active" ?? rec.active; rec.api_next_run = gd.nextRun ?? gd.nextRunAt ?? gd.next_run ?? null; rec.api_status = gd.status ?? null; rec.api_cron = gd.trigger?.cron?.expression ?? null; }
    rec.next_run_utc = rec.api_next_run ?? nextMondayUtc(); rec.next_run_source = rec.api_next_run ? "api" : "computed (next Monday 06:00 UTC)";
  }
  fs.writeFileSync(OUT, scrub(JSON.stringify(rec, null, 2)) + "\n"); console.log(scrub(JSON.stringify(rec)));
}
if (mode === "retarget") {
  // PATCH the delivery of an already-created workflow (same contract as workflows/retarget.ts) — used after a webhook/secret change.
  if (!rec.id) throw new Error("no workflow id in " + OUT);
  const g = await fetch(`${BASE}/automation/api/workflow/${rec.id}`, { headers: H }); const wf = ((await g.json()) as any).data;
  const patch = { trigger: body.trigger, nodes: body.nodes, delivery: body.delivery, enableMemory: body.enableMemory }; // re-sync prompt + delivery from this file
  const r = await fetch(`${BASE}/automation/api/workflow/${rec.id}`, { method: "PATCH", headers: H, body: JSON.stringify(patch) }); const txt = await r.text();
  let active: boolean | undefined; try { active = (((await (await fetch(`${BASE}/automation/api/workflow/${rec.id}`, { headers: H })).json()) as any).data).isActive; } catch { /* */ }
  if (active === false) { const a = await fetch(`${BASE}/automation/api/workflow/${rec.id}/activate`, { method: "POST", headers: H }); active = a.ok; rec.activate_status = a.status; }
  rec.webhook_target = `${BACKEND}/pitchbook/ingest`; rec.retargeted_at = ts(); rec.retarget_status = r.status; rec.active = active ?? rec.active; if (!r.ok) rec.retarget_body = scrub(txt).slice(0, 300);
  fs.writeFileSync(OUT, scrub(JSON.stringify(rec, null, 2)) + "\n"); console.log(scrub(JSON.stringify({ id: rec.id, patch_status: r.status, active })));
}
if (mode === "execute") {
  if (!rec.id) throw new Error("no workflow id in " + OUT);
  const r = await fetch(`${BASE}/automation/api/workflow/${rec.id}/execute`, { method: "POST", headers: H, body: JSON.stringify({ payload: {} }) });
  const txt = await r.text(); let j: any = {}; try { j = JSON.parse(txt); } catch { /* */ }
  const d = j.data ?? j; const ex = d.executionId ?? d.executionID ?? d.id ?? null;
  rec.execution_id = ex; rec.execute_status = r.status; rec.executed_at = ts(); if (!r.ok) rec.execute_body = scrub(txt).slice(0, 300);
  console.log(JSON.stringify({ execute_status: r.status, execution_id: ex }));
  await pollExecution(ex);
}
if (mode === "poll") { await pollExecution(process.argv[3] ?? rec.execution_id); }
/** GET /automation/api/execution/{id} + /logs (live slug get_execution-executionid-logs) until a terminal status or the time budget (default 3 min) runs out. */
async function pollExecution(ex: string | null) {
  const deadline = Date.now() + Number(process.env.POLL_MS ?? 180_000); let lines: string[] = []; let status = "unknown"; let lastStatus = 0; let ended: number | null = null;
  while (ex && Date.now() < deadline) {
    const e = await fetch(`${BASE}/automation/api/execution/${ex}`, { headers: H }); const ej: any = await e.json().catch(() => ({})); const ed = ej.data ?? {};
    const l = await fetch(`${BASE}/automation/api/execution/${ex}/logs`, { headers: H }); lastStatus = l.status; const lj: any = await l.json().catch(() => ({}));
    const arr: any[] = Array.isArray(lj.data) ? lj.data : [];
    lines = arr.map((x: any) => `[${x.nodeKey || "wf"}] ${x.message}${x.status ? ` (${x.status})` : ""}`);
    status = String(ed.status ?? "unknown"); ended = ed.endedAtInMilliseconds || null;
    if (status !== "executing" && status !== "unknown") break;
    await new Promise((res) => setTimeout(res, 10_000));
  }
  rec.execution_status = status; rec.ended_at = ended ? new Date(ended).toISOString().replace(/\.\d{3}Z$/, "Z") : null; rec.logs_http_status = lastStatus; rec.log_lines = lines.length; rec.log_excerpt = scrub(lines.slice(-10).join(" | ")).slice(0, 1500); rec.polled_until = ts();
  const delivery = lines.find((s) => /delivery/i.test(s)); rec.delivery_log = delivery ? scrub(delivery) : null;
  if (delivery && /fail/i.test(delivery)) rec.delivery_note = `webhook delivery to ${BACKEND}/pitchbook/ingest failed — the backend at that URL must be (re)deployed with the /pitchbook routes before the next Monday 06:00 UTC run; replay with: tsx workflows/replay.ts ${ex}`;
  fs.writeFileSync(OUT, scrub(JSON.stringify(rec, null, 2)) + "\n"); console.log(scrub(JSON.stringify({ execution_id: ex, status, ended_at: rec.ended_at, log_lines: lines.length, excerpt: rec.log_excerpt })));
}
if (false) {
}
