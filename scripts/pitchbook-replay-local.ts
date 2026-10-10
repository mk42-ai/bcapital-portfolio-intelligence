// Replay the REAL node output of a finished weekly execution into /pitchbook/ingest in-process (no network, no DB write) to prove the salvage path.
process.env.NODE_ENV = "test"; process.env.INGEST_SECRET = "test-secret"; process.env.DB_READONLY = "1";
import fs from "node:fs";
const { app } = await import("../src/app.js");
const file = process.argv[2] ?? "proof/pitchbook/workflow-exec-6aca3d9d-node-outputs.json";
const val: string = JSON.parse(fs.readFileSync(file, "utf8")).data.outputs["analyzer-0"].value;
const r = await app.request("http://local/pitchbook/ingest", { method: "POST", headers: { "X-Ingest-Secret": "test-secret" }, body: val });
const j: any = await r.json(); console.log(JSON.stringify({ status: r.status, ...j, slugs: j.slugs?.length }));
const g: any = await (await app.request("http://local/pitchbook/fervo-energy")).json(); console.log(JSON.stringify({ fervo_investors: g.data?.investors?.matched?.map((i: any) => i.name), total_reported: g.data?.investors?.total_reported, availability: g.data?.availability }));
const l: any = await (await app.request("http://local/pitchbook")).json(); console.log(JSON.stringify({ count: l.count, next_run_utc: l.next_run_utc }));
