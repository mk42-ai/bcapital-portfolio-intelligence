/**
 * In-memory media relay store, shared across route bundles via `globalThis` (Next bundles each route separately — a module-level Map
 * in /api/media would NOT be visible from /api/media/blob/[token] or /api/chat). Two keyspaces, both with a 2 h TTL:
 *   blobs:   token (32 random bytes, hex) → bytes + mime — published at GET /api/media/blob/<token> so OnDemand can FETCH the file by URL
 *   texts:   OnDemand media id → extracted text (≤40 KB) + meta — read by /api/chat to ground the turn
 * Nothing here is persisted; a cold start simply forgets the files (the OnDemand media object itself survives on their side).
 */
export const MEDIA_TTL_MS = 2 * 60 * 60_000;
export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const EXTRACT_KEEP_CHARS = 40_000;

export type BlobEntry = { bytes: Uint8Array; mime: string; name: string; at: number };
export type TextEntry = { text: string; name: string; kind: MediaKind; mime: string; sizeBytes: number; at: number };
export type MediaKind = "document" | "image" | "audio";

type Store = { blobs: Map<string, BlobEntry>; texts: Map<string, TextEntry>; lastSweep: number };
const g = globalThis as unknown as { __bcapMediaStore?: Store };
const store: Store = g.__bcapMediaStore ?? (g.__bcapMediaStore = { blobs: new Map(), texts: new Map(), lastSweep: 0 });

function sweep() {
  const now = Date.now();
  if (now - store.lastSweep < 60_000) return;
  store.lastSweep = now;
  for (const [k, v] of store.blobs) if (now - v.at > MEDIA_TTL_MS) store.blobs.delete(k);
  for (const [k, v] of store.texts) if (now - v.at > MEDIA_TTL_MS) store.texts.delete(k);
}

export const putBlob = (token: string, entry: Omit<BlobEntry, "at">) => { sweep(); store.blobs.set(token, { ...entry, at: Date.now() }); };
export const getBlob = (token: string): BlobEntry | null => { sweep(); const e = store.blobs.get(token); if (!e) return null; if (Date.now() - e.at > MEDIA_TTL_MS) { store.blobs.delete(token); return null; } return e; };
export const deleteBlob = (token: string) => store.blobs.delete(token);
export const putText = (mediaId: string, entry: Omit<TextEntry, "at">) => { sweep(); store.texts.set(mediaId, { ...entry, text: entry.text.slice(0, EXTRACT_KEEP_CHARS), at: Date.now() }); };
export const getText = (mediaId: string): TextEntry | null => { sweep(); const e = store.texts.get(mediaId); if (!e) return null; if (Date.now() - e.at > MEDIA_TTL_MS) { store.texts.delete(mediaId); return null; } return e; };
export const deleteText = (mediaId: string) => store.texts.delete(mediaId);

/** Allow-list: extension → { mime(s) accepted from the browser, canonical mime, kind }. Browsers report inconsistent mimes for csv/md/m4a, so the extension is authoritative and the mime is checked loosely. */
export const ALLOWED: Record<string, { mime: string; kind: MediaKind; alt: string[] }> = {
  pdf: { mime: "application/pdf", kind: "document", alt: [] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document", alt: ["application/zip", "application/octet-stream"] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "document", alt: ["application/zip", "application/octet-stream"] },
  csv: { mime: "text/csv", kind: "document", alt: ["text/plain", "application/vnd.ms-excel", "application/csv", "application/octet-stream"] },
  txt: { mime: "text/plain", kind: "document", alt: ["application/octet-stream"] },
  md: { mime: "text/markdown", kind: "document", alt: ["text/plain", "text/x-markdown", "application/octet-stream"] },
  png: { mime: "image/png", kind: "image", alt: [] },
  jpg: { mime: "image/jpeg", kind: "image", alt: ["image/jpg"] },
  jpeg: { mime: "image/jpeg", kind: "image", alt: ["image/jpg"] },
  webp: { mime: "image/webp", kind: "image", alt: [] },
  mp3: { mime: "audio/mpeg", kind: "audio", alt: ["audio/mp3", "audio/mpeg3", "application/octet-stream"] },
  wav: { mime: "audio/wav", kind: "audio", alt: ["audio/x-wav", "audio/wave", "audio/vnd.wave", "application/octet-stream"] },
  m4a: { mime: "audio/mp4", kind: "audio", alt: ["audio/x-m4a", "audio/m4a", "audio/aac", "application/octet-stream"] },
};
export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);
export const ALLOWED_LABEL = "PDF, DOCX, XLSX, CSV, TXT, MD, PNG, JPG, JPEG, WEBP, MP3, WAV or M4A";

/**
 * OnDemand file-type plugin ids (live `GET /plugin/v1/search`, type "file", all subscribed+active on this account, probed 2026-10-10):
 * Document plugin-1713954536 · Images plugin-1713958591 · Audio plugin-1713958830. `plugins: []` is rejected upstream with HTTP 500
 * `errors.no.executable.plugin.found` (pdf) / `errors.server_error` (txt) — see web/proof/upload/media-create.json.
 */
export const MEDIA_PLUGIN_BY_KIND: Record<MediaKind, string> = { document: "plugin-1713954536", image: "plugin-1713958591", audio: "plugin-1713958830" };

export function classify(name: string, mime: string): { ok: true; ext: string; mime: string; kind: MediaKind } | { ok: false; reason: string } {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");
  const spec = ALLOWED[ext];
  if (!spec) return { ok: false, reason: `"${name}" is not a supported file type — attach a ${ALLOWED_LABEL} file` };
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  if (m && m !== spec.mime && !spec.alt.includes(m)) return { ok: false, reason: `"${name}" reports type ${m}, which does not match .${ext} — attach a ${ALLOWED_LABEL} file` };
  return { ok: true, ext, mime: spec.mime, kind: spec.kind };
}
