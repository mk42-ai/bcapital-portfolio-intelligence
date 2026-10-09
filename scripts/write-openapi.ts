import fs from "node:fs";
import { buildOpenApi } from "../src/openapi.js";
const url = process.env.PUBLIC_BASE_URL ?? "https://serverless.on-demand.io/apps/bcap-portfolio-api";
fs.writeFileSync("openapi.json", JSON.stringify(buildOpenApi(url), null, 2));
console.log(JSON.stringify({ ok: true, file: "openapi.json", server: url }));
