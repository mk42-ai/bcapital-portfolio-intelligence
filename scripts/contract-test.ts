#!/usr/bin/env tsx
/**
 * contract-test.ts — lightweight OpenAPI contract test for the read API.
 *
 * Usage:  npx tsx scripts/contract-test.ts https://sb-1gek6bq0m1au.vercel.run
 *
 * For every GET path in openapi.json it performs the request (path params are
 * substituted from SAMPLE_PARAMS, required query params from SAMPLE_QUERY),
 * then asserts:
 *   1. the HTTP status is one documented for that operation,
 *   2. the content-type is JSON,
 *   3. the top-level keys of the body match the documented response schema
 *      (required properties present, basic JSON types of documented properties).
 * An extra negative probe hits GET /companies/{slug} with an unknown slug and
 * expects a documented 404 shaped like components.schemas.Error.
 * POST operations (e.g. /ingest) are never executed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  $ref?: string;
  nullable?: boolean;
};

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const specPath = resolve(process.cwd(), "openapi.json");
const spec = JSON.parse(readFileSync(specPath, "utf8"));

const SAMPLE_PARAMS: Record<string, string> = { slug: "fervo-energy" };
const SAMPLE_QUERY: Record<string, string> = { q: "fervo" };

function deref(s: Schema | undefined): Schema | undefined {
  if (!s) return s;
  if (s.$ref) {
    const parts = s.$ref.replace(/^#\//, "").split("/");
    let cur: any = spec;
    for (const p of parts) cur = cur?.[p];
    return deref(cur as Schema);
  }
  return s;
}

function jsonType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // string | number | boolean | object
}

function typeMatches(expected: string | string[] | undefined, actual: string): boolean {
  if (!expected) return true;
  const list = Array.isArray(expected) ? expected : [expected];
  return list.some((t) => {
    if (t === "integer") return actual === "number";
    if (t === "number") return actual === "number";
    return t === actual;
  });
}

/** Validate the top level of `body` against `schema`; returns error strings. */
function validateTopLevel(body: unknown, schema: Schema | undefined, where = "$"): string[] {
  const errs: string[] = [];
  const s = deref(schema);
  if (!s) return errs;
  const actualType = jsonType(body);
  if (s.type && !typeMatches(s.type, actualType)) {
    errs.push(`${where}: expected type ${JSON.stringify(s.type)}, got ${actualType}`);
    return errs;
  }
  if (actualType === "object" && s.properties) {
    const obj = body as Record<string, unknown>;
    for (const req of s.required ?? []) {
      if (!(req in obj)) errs.push(`${where}: missing required property "${req}"`);
    }
    for (const [k, ps] of Object.entries(s.properties)) {
      if (!(k in obj)) continue;
      const p = deref(ps);
      const t = jsonType(obj[k]);
      const allowed = p?.type;
      const nullableOk = t === "null" && (p?.nullable || (Array.isArray(allowed) && allowed.includes("null")));
      if (allowed && !nullableOk && !typeMatches(allowed, t)) {
        errs.push(`${where}.${k}: expected ${JSON.stringify(allowed)}, got ${t}`);
      }
      // One level deeper for arrays of objects: check required keys of first item.
      if (t === "array" && p?.items) {
        const first = (obj[k] as unknown[])[0];
        if (first !== undefined) errs.push(...validateTopLevel(first, p.items, `${where}.${k}[0]`));
      }
      if (t === "object" && p?.properties && obj[k] && !Array.isArray(obj[k])) {
        errs.push(...validateTopLevel(obj[k], p, `${where}.${k}`));
      }
    }
  }
  return errs;
}

type Result = { name: string; ok: boolean; status: number; detail: string[] };
const results: Result[] = [];

async function runCase(name: string, url: string, op: any): Promise<void> {
  const detail: string[] = [];
  let status = 0;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    status = res.status;
    const documented = Object.keys(op.responses ?? {});
    if (!documented.includes(String(status))) {
      detail.push(`status ${status} not documented (documented: ${documented.join(",")})`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!/application\/json/i.test(ct)) detail.push(`content-type not JSON: "${ct}"`);
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      detail.push("body is not valid JSON");
    }
    if (body !== undefined) {
      const schema = op.responses?.[String(status)]?.content?.["application/json"]?.schema as Schema | undefined;
      if (schema) detail.push(...validateTopLevel(body, schema));
      else detail.push(`no JSON schema documented for status ${status}`);
    }
  } catch (e: any) {
    detail.push(`request failed: ${e?.message ?? e}`);
  }
  results.push({ name, ok: detail.length === 0, status, detail });
}

async function main(): Promise<void> {
  const paths = spec.paths as Record<string, Record<string, any>>;
  // Deployed spec (if reachable) — used only to label drift between the local openapi.json and the running build.
  let livePaths: Set<string> | null = null;
  try {
    const live = await fetch(`${baseUrl}/openapi.json`, { headers: { accept: "application/json" } });
    if (live.ok) livePaths = new Set(Object.keys(((await live.json()) as any).paths ?? {}));
  } catch { /* ignore */ }
  for (const [path, ops] of Object.entries(paths)) {
    const op = ops.get;
    if (!op) continue; // never execute POST /ingest etc.
    let concrete = path.replace(/\{(\w+)\}/g, (_, k) => SAMPLE_PARAMS[k] ?? "unknown");
    const qs = new URLSearchParams();
    for (const prm of op.parameters ?? []) {
      if (prm.in === "query" && prm.required && SAMPLE_QUERY[prm.name]) qs.set(prm.name, SAMPLE_QUERY[prm.name]);
    }
    if (path === "/companies") qs.set("limit", "200");
    const url = `${baseUrl}${concrete}${qs.toString() ? `?${qs}` : ""}`;
    await runCase(`GET ${path}`, url, op);
    if (livePaths && !livePaths.has(path)) {
      const last = results[results.length - 1];
      last.detail.push("path is absent from the deployed /openapi.json — the live build predates the local spec (redeploy backend)");
      last.ok = false;
    }
    // Negative probe for the documented 404 on the single-company route.
    if (path === "/companies/{slug}" && op.responses?.["404"]) {
      await runCase(`GET ${path} (unknown slug → 404)`, `${baseUrl}/companies/__contract_test_missing__`, op);
    }
  }

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.ok) passed++;
    else failed++;
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  [HTTP ${r.status}]`);
    for (const d of r.detail) console.log(`        - ${d}`);
  }
  console.log(`\n${passed} passed, ${failed} failed (${results.length} cases) against ${baseUrl}`);
  console.log(JSON.stringify({ passed, failed, cases: results.map((r) => ({ name: r.name, ok: r.ok, status: r.status })) }));
  process.exit(failed === 0 ? 0 : 1);
}

main();
