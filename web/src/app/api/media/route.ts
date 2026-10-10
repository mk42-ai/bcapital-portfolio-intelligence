import { NextRequest } from "next/server";
import { ONDEMAND_BASE_URL, serverApiKey, UPSTREAM_USER_AGENT, DEFAULT_EXTERNAL_USER_ID } from "@/lib/ondemand/config";
import { ALLOWED_EXTENSIONS, ALLOWED_LABEL, MEDIA_MAX_BYTES, MEDIA_PLUGIN_BY_KIND, classify, putBlob, deleteBlob, putText, deleteText, getText } from "@/lib/media/store";

/**
 * Media relay — `POST /api/media` (multipart: file, sessionId?, externalUserId?).
 * OnDemand's Create Media endpoint (`POST /media/v1/public/file`, live docs 2026-10-10) takes a public https URL — it FETCHES the bytes, there is no
 * binary upload. So the relay (1) validates the file (allow-list + 25 MB), (2) publishes the bytes for 2 h at GET /api/media/blob/<token> (32-byte
 * random token, in-memory globalThis store), (3) calls OnDemand with that URL, the thread's sessionId and the file-type plugin id, responseMode
 * "sync", (4) fetches `extractedTextUrl` (≤200 KB) and keeps ≤40 KB server-side under the media id so /api/chat can ground the next turn.
 * The API key is read only here via serverApiKey() and never logged or returned.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 60_000;
const EXTRACT_MAX_BYTES = 200 * 1024;
const NO_STORE = { "cache-control": "no-store" };
const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => Response.json({ ok: false, code, message, ...extra }, { status, headers: NO_STORE });

function publicOrigin(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (env && /^https?:\/\//.test(env)) return env;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-ondemand-key")?.trim() || serverApiKey();
  if (!key) return fail(503, "no_key", "OnDemand API key is not configured on the server");
  // 25 MB pre-check on the declared length (cheap 413 before reading the body).
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared && declared > MEDIA_MAX_BYTES + 64 * 1024) return fail(413, "too_large", `File is ${mb(declared)} MB — the limit is 25 MB`, { maxBytes: MEDIA_MAX_BYTES });
  let form: FormData;
  try { form = await req.formData(); } catch { return fail(400, "bad_request", "expected multipart/form-data with a `file` field"); }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "bad_request", "missing `file` field");
  const name = (file.name || "upload").replace(/[\r\n"]/g, "").slice(0, 180);
  const cls = classify(name, file.type);
  if (!cls.ok) return fail(400, "unsupported_type", cls.reason, { allowed: ALLOWED_EXTENSIONS });
  if (file.size > MEDIA_MAX_BYTES) return fail(413, "too_large", `File is ${mb(file.size)} MB — the limit is 25 MB`, { maxBytes: MEDIA_MAX_BYTES });
  if (file.size === 0) return fail(400, "bad_request", `"${name}" is empty`);
  const sessionIdRaw = String(form.get("sessionId") ?? "").trim();
  const sessionId = /^[A-Za-z0-9]{6,64}$/.test(sessionIdRaw) ? sessionIdRaw : "";
  const externalUserId = (String(form.get("externalUserId") ?? "").trim() || DEFAULT_EXTERNAL_USER_ID).slice(0, 64);

  // 2. publish the bytes at a public URL OnDemand can fetch. Optional `publicUrl` (https) = the SAME file already hosted publicly — used when
  //    this server is not reachable from the internet (local dev / tests); the bytes are still validated and the blob still published.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  putBlob(token, { bytes, mime: cls.mime, name });
  const blobUrl = `${publicOrigin(req)}/api/media/blob/${token}/${encodeURIComponent(name.replace(/[^A-Za-z0-9._-]+/g, "_"))}`;
  const publicUrlRaw = String(form.get("publicUrl") ?? "").trim();
  const url = /^https:\/\/[^\s"']{8,2048}$/.test(publicUrlRaw) ? publicUrlRaw : blobUrl;

  // 3. create the OnDemand media object (sync) — the file-type plugin id is required (plugins:[] → HTTP 500 upstream, proof/upload/media-create.json)
  const body = { url, name, sizeBytes: file.size, ...(sessionId ? { sessionId } : {}), externalUserId, plugins: [MEDIA_PLUGIN_BY_KIND[cls.kind]], responseMode: "sync" as const };
  const t0 = Date.now();
  let up: Response; let raw = "";
  try {
    up = await fetch(`${ONDEMAND_BASE_URL}/media/v1/public/file`, { method: "POST", headers: { apikey: key, "content-type": "application/json", "user-agent": UPSTREAM_USER_AGENT }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    raw = await up.text();
  } catch (e) {
    deleteBlob(token);
    const msg = String((e as Error)?.name === "TimeoutError" ? "timeout" : (e as Error)?.message ?? e);
    if (msg === "timeout" || /abort/i.test(msg)) return fail(504, "upstream_timeout", `OnDemand did not accept the file within ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)} s — try again`);
    return fail(502, "upstream_fetch_failed", `Could not reach OnDemand: ${msg}`);
  }
  let j: { message?: string; errorCode?: string; data?: Record<string, unknown> } = {};
  try { j = JSON.parse(raw); } catch { /* non-JSON upstream body */ }
  const data = j.data ?? {};
  const plainText = cls.ext === "txt" || cls.ext === "md" || cls.ext === "csv";
  if ((!up.ok || typeof data.id !== "string") && plainText && up.status === 500) {
    // Local-grounding fallback: OnDemand answers HTTP 500 (`errors.server_error`) for plain-text uploads even with the document plugin
    // (proof/upload/media-create.json). The bytes ARE the text, so keep ≤40 KB utf-8 under a locally generated `local-<hex>` id (passes the
    // /^[A-Za-z0-9_-]{6,64}$/ id check in /api/chat) and say so honestly — the chat still grounds on the document, nothing is stored upstream.
    deleteBlob(token);
    const id = `local-${Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("hex")}`;
    const text = Buffer.from(bytes.subarray(0, EXTRACT_MAX_BYTES)).toString("utf8").replace(/\u0000/g, "").trim();
    putText(id, { text, name, kind: cls.kind, mime: cls.mime, sizeBytes: file.size });
    return Response.json({
      ok: true,
      media: { id, name, sizeBytes: file.size, mime: cls.mime, url: null, blobUrl: null, extractedTextUrl: null, extractedChars: text.length, kind: cls.kind, grounded: "local" as const, sessionId: sessionId || null, pluginId: MEDIA_PLUGIN_BY_KIND[cls.kind], upstreamMs: Date.now() - t0, upstreamStatus: up.status, upstreamMessage: j.message ?? null },
      note: `OnDemand media create failed upstream (HTTP ${up.status}) — grounded locally from the uploaded text`,
      extractedTextPreview: text.slice(0, 400),
    }, { headers: NO_STORE });
  }
  if (!up.ok || typeof data.id !== "string") {
    deleteBlob(token);
    return fail(up.status === 401 || up.status === 403 ? 401 : 502, "upstream_http", `OnDemand rejected the file (HTTP ${up.status}): ${j.message ?? raw.slice(0, 200) ?? "no message"}`, { upstreamStatus: up.status, upstreamMessage: j.message ?? null });
  }
  const id = data.id;
  // 4. extracted text: inline `extractedText`/`context` (observed live) or fetched from `extractedTextUrl` (≤200 KB)
  let text = typeof data.extractedText === "string" ? data.extractedText : typeof data.context === "string" ? data.context : "";
  const extractedTextUrl = typeof data.extractedTextUrl === "string" ? data.extractedTextUrl : null;
  // Plain-text kinds (txt/md/csv): the bytes ARE the text — use them directly (OnDemand echoes the source URL as extractedTextUrl for these).
  if (cls.ext === "txt" || cls.ext === "md" || cls.ext === "csv") text = Buffer.from(bytes.subarray(0, EXTRACT_MAX_BYTES)).toString("utf8");
  else if (extractedTextUrl && (!text || text.length < 200)) {
    try {
      const r = await fetch(extractedTextUrl, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (r.ok) {
        const len = Number(r.headers.get("content-length") ?? 0);
        if (!len || len <= EXTRACT_MAX_BYTES) { const buf = Buffer.from(await r.arrayBuffer()); text = buf.subarray(0, EXTRACT_MAX_BYTES).toString("utf8") || text; }
        else { const reader = r.body?.getReader(); if (reader) { const chunks: Uint8Array[] = []; let got = 0; while (got < EXTRACT_MAX_BYTES) { const { value, done } = await reader.read(); if (done || !value) break; chunks.push(value); got += value.length; } await reader.cancel().catch(() => {}); text = Buffer.concat(chunks).toString("utf8") || text; } }
      }
    } catch { /* grounding is best-effort; the media object still exists upstream */ }
  }
  text = text.replace(/\u0000/g, "").trim();
  putText(id, { text, name, kind: cls.kind, mime: cls.mime, sizeBytes: file.size });
  return Response.json({
    ok: true,
    media: { id, name, sizeBytes: file.size, mime: cls.mime, url, blobUrl, extractedTextUrl, extractedChars: text.length, kind: cls.kind, grounded: "ondemand" as const, sessionId: typeof data.sessionId === "string" ? data.sessionId : sessionId || null, pluginId: MEDIA_PLUGIN_BY_KIND[cls.kind], upstreamMs: Date.now() - t0 },
    extractedTextPreview: text.slice(0, 400),
  }, { headers: NO_STORE });
}

/** `DELETE /api/media?id=<mediaId>` — relays the delete to OnDemand and forgets the extracted text. */
export async function DELETE(req: NextRequest) {
  const key = req.headers.get("x-ondemand-key")?.trim() || serverApiKey();
  if (!key) return fail(503, "no_key", "OnDemand API key is not configured on the server");
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return fail(400, "bad_request", "missing or malformed `id`");
  deleteText(id);
  if (id.startsWith("local-")) return Response.json({ ok: true, id, upstreamStatus: null, message: "locally grounded media — nothing to delete upstream" }, { headers: NO_STORE });
  try {
    const up = await fetch(`${ONDEMAND_BASE_URL}/media/v1/public/file/${encodeURIComponent(id)}`, { method: "DELETE", headers: { apikey: key, "user-agent": UPSTREAM_USER_AGENT }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const raw = await up.text().catch(() => "");
    let msg: string | null = null; try { msg = (JSON.parse(raw) as { message?: string }).message ?? null; } catch { /* ignore */ }
    if (!up.ok && up.status !== 404) return fail(502, "upstream_http", `OnDemand delete failed (HTTP ${up.status}): ${msg ?? raw.slice(0, 200)}`, { upstreamStatus: up.status });
    return Response.json({ ok: true, id, upstreamStatus: up.status, message: msg }, { headers: NO_STORE });
  } catch (e) {
    return fail((e as Error)?.name === "TimeoutError" ? 504 : 502, (e as Error)?.name === "TimeoutError" ? "upstream_timeout" : "upstream_fetch_failed", String((e as Error)?.message ?? e));
  }
}

/** `GET /api/media?id=<mediaId>` — does the bridge still hold extracted text for this id? (no text is returned; used by tests + the chip tooltip) */
export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return Response.json({ ok: true, allowed: ALLOWED_EXTENSIONS, allowedLabel: ALLOWED_LABEL, maxBytes: MEDIA_MAX_BYTES }, { headers: NO_STORE });
  const t = getText(id);
  return Response.json({ ok: true, id, known: !!t, extractedChars: t?.text.length ?? 0, name: t?.name ?? null, kind: t?.kind ?? null }, { headers: NO_STORE });
}

const mb = (n: number) => (n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1);
