/** Re-point every created workflow's webhook delivery at a new serverless base URL (PATCH /workflow/{id}, live slug patch_workflow-id).
 *  Usage: SERVERLESS_BASE_URL=https://… INGEST_SECRET=… ON_DEMAND_API_KEY=… tsx workflows/retarget.ts */
import fs from "node:fs";
const BASE = (process.env.ON_DEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
const target = (process.env.SERVERLESS_BASE_URL ?? "").replace(/\/$/, ""); if (!target) throw new Error("SERVERLESS_BASE_URL not set");
const SECRET = process.env.INGEST_SECRET ?? ""; if (!SECRET) throw new Error("INGEST_SECRET not set");
const apikey = process.env.ON_DEMAND_API_KEY; if (!apikey) throw new Error("ON_DEMAND_API_KEY not set");
const H = { apikey, "content-type": "application/json" };
const created = JSON.parse(fs.readFileSync("workflows/created.json", "utf8"));
for (const c of created) {
  const g = await fetch(`${BASE}/automation/api/workflow/${c.id}`, { headers: H }); const wf = (await g.json()).data;
  for (const d of wf.delivery) if (d.channel === "webhook") d.config = { webhook: { url: `${target}/ingest?secret=${SECRET}`, method: "POST", basicAuth: { username: "ingest", password: SECRET } } };
  for (const d of wf.delivery) if (d.channel === "email") d.config = { email: { addresses: d.config.email.addresses } };
  const body = { trigger: wf.trigger, nodes: wf.nodes, delivery: wf.delivery, enableMemory: wf.enableMemory };
  const r = await fetch(`${BASE}/automation/api/workflow/${c.id}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
  const txt = await r.text();
  let active: boolean | undefined; try { const after = (await (await fetch(`${BASE}/automation/api/workflow/${c.id}`, { headers: H })).json()).data; active = after.isActive; } catch {}
  if (active === false) { const a = await fetch(`${BASE}/automation/api/workflow/${c.id}/activate`, { method: "POST", headers: H }); active = a.ok; }
  c.webhook_target = target; c.retargeted_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); c.retarget_status = r.status; c.activation_status = active ? "active" : "inactive";
  console.log(JSON.stringify({ name: c.name, id: c.id, patch_status: r.status, active, note: r.ok ? undefined : txt.slice(0, 200) }));
}
fs.writeFileSync("workflows/created.json", JSON.stringify(created, null, 2));
