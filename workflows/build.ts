/**
 * Build, create, activate and (optionally) execute the daily Flow Builder workflows.
 *   tsx workflows/build.ts plan            → writes workflows/*.json only (no API calls)
 *   tsx workflows/build.ts create          → POST /workflow + POST /activate for each, writes workflows/created.json
 *   tsx workflows/build.ts execute         → POST /execute each created workflow once (seeding run)
 * Env: ON_DEMAND_API_KEY (never printed), ON_DEMAND_BASE_URL, SERVERLESS_BASE_URL, INGEST_SECRET, MODEL (default predefined-deepseek-flash = DeepSeek Flash v4.1, endpoint_name deepseek-v4.1-flash),
 *      NOTIFY_EMAIL (delivery address for the run summary e-mail).
 * Contract source: live docs slug post_workflow (CreateWorkflowRequest: name, trigger{type:cron,cron{expression 6-field}}, nodes[], delivery[]).
 */
import fs from "node:fs";
import path from "node:path";

const MODEL = process.env.MODEL ?? "predefined-deepseek-flash"; // DeepSeek Flash v4.1 (endpoint_name deepseek-v4.1-flash)
const CRON = "0 0 6 * * *"; // 06:00 UTC daily — 6-field robfig/cron (seconds first)
const BASE = (process.env.ON_DEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
const SERVERLESS = (process.env.SERVERLESS_BASE_URL ?? "https://serverless.on-demand.io/apps/bcap-portfolio-api").replace(/\/$/, "");
const SECRET = process.env.INGEST_SECRET ?? "<INGEST_SECRET>";
const EMAIL = process.env.NOTIFY_EMAIL ?? "mk@airev.ae";
const PLUGINS = { perplexity: "plugin-1722260873" }; // Perplexity is the ONLY plugin wired into any node (all others removed 2026-10-10)
const FOCUS = ["Perplexity AI", "Apptronik", "Fervo Energy", "Flutterwave", "WRITER"];

const seed = JSON.parse(fs.readFileSync(path.resolve("data/seed.json"), "utf8"));
const all: { name: string; slug: string }[] = seed.companies.filter((c: any) => c.b_capital_role !== "firm").map((c: any) => ({ name: c.name, slug: c.slug }));
const focus = all.filter((c) => FOCUS.includes(c.name));
const rest = all.filter((c) => !FOCUS.includes(c.name));
const BATCH = 25;
const batches: { name: string; slug: string }[][] = [];
for (let i = 0; i < rest.length; i += BATCH) batches.push(rest.slice(i, i + BATCH));

const pos = (i: number) => ({ position: { x: 100 + i * 400, y: 200 }, measured: { width: 300, height: 500 } });
const list = (cs: { name: string; slug: string }[]) => cs.map((c) => `${c.name} (slug: ${c.slug})`).join("; ");

function workflow(name: string, cs: { name: string; slug: string }[]) {
  const companies = list(cs);
  const nodes: any[] = [
    { key: "research", kind: "source", type: "llm", dependencies: [], nextNodeKeys: ["verify"], ...pos(0),
      llm: { model: MODEL, plugins: [{ id: PLUGINS.perplexity }],
        fulfillmentPrompt: "You are the B Capital Portfolio Intelligence research agent. Use the attached Perplexity agent for EVERY company listed: latest news with source URLs and image URLs (last 7 days), company updates / headcount signals and community sentiment as far as Perplexity surfaces them. Output STRICT JSON only, no prose.",
        prompt: `Research these B Capital portfolio companies: ${companies}. For each company return an object {\"slug\",\"name\",\"news\":[{\"title\",\"url\",\"source\",\"published_at\",\"summary\",\"image_url\"}],\"linkedin\":{\"headcount\",\"updates\":[...]},\"reddit\":[{\"url\",\"quote\"}],\"x\":[{\"url\",\"quote\"}]}. Return {\"companies\":[...]} as pure JSON.` } },
    { key: "verify", kind: "intermediate", type: "llm", dependencies: [{ nodeKey: "research" }], nextNodeKeys: ["score"], ...pos(1),
      llm: { model: MODEL, plugins: [{ id: PLUGINS.perplexity }],
        fulfillmentPrompt: "You are a funding-verification analyst. Use Perplexity to verify funding, valuation, status changes (IPO, M&A, rename, shutdown) and exits for each company. PitchBook data is NOT available in this run: set pitchbook_status to \"pending\" for every company. Output STRICT JSON only.",
        prompt: `Verify funding/valuation/exit facts for: ${companies}. Research input: {{research}}. Return {\"companies\":[{\"slug\",\"funding_verification\",\"stage\",\"status\",\"employees\",\"pitchbook_status\":\"pending\",\"sources\":[\"url\"]}]} as pure JSON.` } },
    { key: "score", kind: "intermediate", type: "llm", dependencies: [{ nodeKey: "research" }, { nodeKey: "verify" }], nextNodeKeys: ["deliver"], ...pos(2),
      llm: { model: MODEL, plugins: [],
        fulfillmentPrompt: "You are the sentiment scorer for B Capital Portfolio Intelligence. Score each company from -1 (very negative) to 1 (very positive) using the evidence provided; label with exactly one of: very negative, negative, neutral, positive, very positive (thresholds: <=-0.6, <=-0.2, <0.2, <0.6, else). Each evidence item must cite a real url from the inputs and a short verbatim quote. Compute the batch average, per-sector averages and note that deltas vs the previous run are computed server-side from stored history. Output STRICT JSON only — this payload is POSTed verbatim to the ingest API.",
        prompt: `Inputs — research: {{research}} ; verification: {{verify}}. Workflow name: ${name}. Model: ${MODEL}. Return exactly {\"workflow_name\":\"${name}\",\"model\":\"${MODEL}\",\"run_at\":\"<ISO-8601 UTC>\",\"companies\":[{\"slug\",\"name\",\"status\",\"stage\",\"employees\",\"pitchbook_status\":\"pending\",\"sentiment\":{\"score\":<-1..1>,\"label\":\"...\",\"evidence\":[{\"url\",\"quote\"}]},\"news\":[{\"title\",\"url\",\"source\",\"published_at\",\"summary\",\"image_url\"}]}],\"rollups\":{\"batch_avg\":<number>,\"by_sector\":{}}} as pure JSON with no markdown fences.` } },
    { key: "deliver", kind: "intermediate", type: "llm", dependencies: [{ nodeKey: "score" }], nextNodeKeys: ["analyzer-0"], ...pos(3),
      llm: { model: MODEL, plugins: [],
        fulfillmentPrompt: "Pass the JSON through unchanged. Do not add commentary.",
        prompt: "{{score}}" } },
    { key: "analyzer-0", kind: "sink", type: "o_analyzer", dependencies: [{ nodeKey: "deliver" }], nextNodeKeys: ["add-delivery"], ...pos(4) },
  ];
  return {
    name,
    trigger: { type: "cron", cron: { expression: CRON, type: "advanced" }, nextNodeKeys: ["research"], position: { x: 0, y: 0 }, measured: { width: 300, height: 500 } },
    nodes,
    // Two deliveries: the HTTP write-back to the serverless /ingest endpoint (final HTTP node) and an e-mail copy of the run.
    delivery: [
      // Live DeliveryChannelConfig.webhook = { url, method, basicAuth } — no custom-header field, so the shared secret travels as
      // HTTP Basic password (and, belt-and-braces, as ?secret=); the API accepts X-Ingest-Secret / Basic / ?secret= interchangeably.
      { channel: "webhook", config: { webhook: { url: `${SERVERLESS}/ingest?secret=${SECRET}`, method: "POST", basicAuth: { username: "ingest", password: SECRET } } }, position: { x: 100 + 5 * 400, y: 200 }, measured: { width: 300, height: 500 } },
      { channel: "email", config: { email: { addresses: [EMAIL] } }, position: { x: 100 + 5 * 400, y: 800 }, measured: { width: 300, height: 500 } },
    ],
    enableMemory: true,
  };
}

const plans = [workflow("bcap-focus-daily", focus), ...batches.map((b, i) => workflow(`bcap-portfolio-daily-batch-${i + 1}`, b))];
fs.mkdirSync("workflows/bodies", { recursive: true });
for (const p of plans) fs.writeFileSync(`workflows/bodies/${p.name}.json`, JSON.stringify(p, null, 2).replaceAll(SECRET, "<INGEST_SECRET>"));
fs.writeFileSync("workflows/plan.json", JSON.stringify({ model: MODEL, cron: CRON, plugins: [PLUGINS.perplexity], workflows: plans.map((p) => ({ name: p.name, companies: p.nodes[0].llm.prompt.match(/slug: ([a-z0-9-]+)/g)!.length })) }, null, 2));

const mode = process.argv[2] ?? "plan";
if (mode === "plan") { console.log(JSON.stringify({ planned: plans.map((p) => p.name), batches: batches.map((b) => b.length), focus: focus.map((f) => f.slug) })); process.exit(0); }
const apikey = process.env.ON_DEMAND_API_KEY; if (!apikey) throw new Error("ON_DEMAND_API_KEY not set");
const H = { apikey, "content-type": "application/json" };
const ts = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const created: any[] = fs.existsSync("workflows/created.json") ? JSON.parse(fs.readFileSync("workflows/created.json", "utf8")) : [];

if (mode === "create") {
  for (const p of plans) {
    if (created.find((c) => c.name === p.name && c.id)) { console.log("exists", p.name); continue; }
    const r = await fetch(`${BASE}/automation/api/workflow`, { method: "POST", headers: H, body: JSON.stringify(p) });
    const txt = await r.text(); let j: any = {}; try { j = JSON.parse(txt); } catch {}
    const d = j.data ?? j; const id = d.id ?? d._id ?? d.workflowID;
    const rec: any = { name: p.name, id, create_status: r.status, created_at: ts(), create_body: r.ok ? undefined : txt.slice(0, 500) };
    if (id) { const a = await fetch(`${BASE}/automation/api/workflow/${id}/activate`, { method: "POST", headers: H }); rec.activate_status = a.status; rec.activation_status = a.ok ? "active" : "inactive"; rec.activated_at = ts(); rec.activate_body = a.ok ? undefined : (await a.text()).slice(0, 300); }
    created.push(rec); console.log(JSON.stringify(rec));
  }
  fs.writeFileSync("workflows/created.json", JSON.stringify(created, null, 2));
}
if (mode === "execute") {
  for (const c of created) {
    if (!c.id) continue;
    const r = await fetch(`${BASE}/automation/api/workflow/${c.id}/execute`, { method: "POST", headers: H, body: JSON.stringify({ payload: {} }) });
    const txt = await r.text(); let j: any = {}; try { j = JSON.parse(txt); } catch {}
    const d = j.data ?? j; const ex = d.executionId ?? d.executionID ?? d.id;
    c.execution_ids = [...(c.execution_ids ?? []), ex].filter(Boolean); c.execute_status = r.status; c.executed_at = ts(); if (!r.ok) c.execute_body = txt.slice(0, 300);
    console.log(JSON.stringify({ name: c.name, execute_status: r.status, execution_id: ex }));
  }
  fs.writeFileSync("workflows/created.json", JSON.stringify(created, null, 2));
}
