/** Replay a finished execution's final node output into the ingest API (used when the webhook delivery failed, e.g. the
 *  serverless endpoint was still provisioning). Reads GET /execution/{id}/node/outputs (live slug get_execution-executionid-node-outputs).
 *  Usage: BASE_URL=https://… INGEST_SECRET=… ON_DEMAND_API_KEY=… tsx workflows/replay.ts <executionId> [<executionId>…] */
const BASE = (process.env.ON_DEMAND_BASE_URL ?? "https://api.on-demand.io").replace(/\/$/, "");
const target = (process.env.BASE_URL ?? "").replace(/\/$/, ""); const secret = process.env.INGEST_SECRET ?? ""; const apikey = process.env.ON_DEMAND_API_KEY;
if (!target || !secret || !apikey) throw new Error("BASE_URL, INGEST_SECRET and ON_DEMAND_API_KEY are required");
for (const ex of process.argv.slice(2)) {
  const r = await fetch(`${BASE}/automation/api/execution/${ex}/node/outputs`, { headers: { apikey } });
  const outputs = (await r.json())?.data?.outputs ?? {};
  const final = outputs["analyzer-0"]?.value ?? outputs["deliver"]?.value ?? outputs["score"]?.value;
  if (!final) { console.log(JSON.stringify({ execution_id: ex, replayed: false, reason: "no final output yet" })); continue; }
  const exec = (await (await fetch(`${BASE}/automation/api/execution/${ex}`, { headers: { apikey } })).json())?.data ?? {};
  let body: any; try { body = JSON.parse(String(final).replace(/^[^{]*/, "").replace(/[^}]*$/, "")); } catch { body = null; }
  const payload = body ? JSON.stringify({ ...body, execution_id: ex, workflow_id: exec.workflowID ?? body.workflow_id }) : String(final);
  const t0 = Date.now();
  const p = await fetch(`${target}/ingest`, { method: "POST", headers: { "content-type": "application/json", "X-Ingest-Secret": secret }, body: payload });
  console.log(JSON.stringify({ execution_id: ex, workflow_id: exec.workflowID, replayed: true, status: p.status, latency_ms: Date.now() - t0, result: (await p.text()).slice(0, 300), at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }));
}
