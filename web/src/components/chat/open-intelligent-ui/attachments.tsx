"use client";
/**
 * Composer attachments — paperclip button, drag-and-drop, paste, XHR upload to /api/media (progress), preview chips, and the per-message
 * attachment chips shown under the user bubble. State lives in a module store (useSyncExternalStore) so chat-shell's fetch wrapper can
 * read the ready attachments synchronously and attach `{mediaId,name,kind,extractedChars}` to `context.attachments`.
 * The chips render inside the app-owned composer row (app-composer.tsx) — no portals, no MutationObserver.
 */
import "./attachments.css";
import { useSyncExternalStore } from "react";
import { AlertCircle, Check, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Music, RotateCcw, X } from "lucide-react";

export type AttachmentKind = "document" | "image" | "audio";
export type AttachmentStatus = "uploading" | "ready" | "error";
export type AttachmentItem = {
  id: string; name: string; sizeBytes: number; mime: string; kind: AttachmentKind; status: AttachmentStatus; progress: number;
  mediaId?: string; extractedChars?: number; error?: string; code?: string; retryable?: boolean; grounded?: "ondemand" | "local"; note?: string;
};
export type SentAttachment = { mediaId: string; name: string; kind: AttachmentKind; extractedChars?: number; sizeBytes?: number };

export const MAX_BYTES = 25 * 1024 * 1024;
export const ACCEPT_EXT = ["pdf", "docx", "xlsx", "csv", "txt", "md", "png", "jpg", "jpeg", "webp", "mp3", "wav", "m4a"] as const;
export const ACCEPT_ATTR = ACCEPT_EXT.map((e) => `.${e}`).join(",");
const KIND_BY_EXT: Record<string, AttachmentKind> = { pdf: "document", docx: "document", xlsx: "document", csv: "document", txt: "document", md: "document", png: "image", jpg: "image", jpeg: "image", webp: "image", mp3: "audio", wav: "audio", m4a: "audio" };
export const DROP_HINT = "Drop a PDF, DOCX, XLSX, CSV, image or audio file — up to 25 MB";
const SENT_KEY = (tid: string) => `bcap.chat.attachments.v1.${tid}`;

type SessionCtx = { sessionId: string | null; externalUserId: string; apikey?: string };
type State = { items: AttachmentItem[]; sent: Record<string, SentAttachment[]>; live: string; dragging: boolean; version: number };
let state: State = { items: [], sent: {}, live: "", dragging: false, version: 0 };
const listeners = new Set<() => void>();
const emit = () => { state = { ...state, version: state.version + 1 }; listeners.forEach((l) => l()); };
const files = new Map<string, File>();
const xhrs = new Map<string, XMLHttpRequest>();
let sessionGetter: () => SessionCtx = () => ({ sessionId: null, externalUserId: "INV-001" });
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fmtMb = (n: number) => (n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1);
export const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${fmtMb(n)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const extOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

function patch(id: string, p: Partial<AttachmentItem>) { state = { ...state, items: state.items.map((a) => (a.id === id ? { ...a, ...p } : a)) }; emit(); }
function setLive(text: string) { state = { ...state, live: text }; emit(); }

/** Client pre-checks (mirror the relay's 400/413 so the user gets an instant chip instead of a round-trip). */
export function precheck(file: File): { ok: true; kind: AttachmentKind } | { ok: false; code: "too_large" | "unsupported_type"; message: string } {
  const ext = extOf(file.name);
  if (!KIND_BY_EXT[ext]) return { ok: false, code: "unsupported_type", message: `"${file.name}" is not a supported type — use PDF, DOCX, XLSX, CSV, TXT, MD, PNG, JPG, WEBP, MP3, WAV or M4A` };
  if (file.size > MAX_BYTES) return { ok: false, code: "too_large", message: `File is ${fmtMb(file.size)} MB — the limit is 25 MB` };
  if (file.size === 0) return { ok: false, code: "unsupported_type", message: `"${file.name}" is empty` };
  return { ok: true, kind: KIND_BY_EXT[ext] };
}

function upload(id: string) {
  const file = files.get(id); if (!file) return;
  const ctx = sessionGetter();
  const fd = new FormData();
  fd.append("file", file, file.name);
  if (ctx.sessionId) fd.append("sessionId", ctx.sessionId);
  fd.append("externalUserId", ctx.externalUserId);
  const xhr = new XMLHttpRequest();
  xhrs.set(id, xhr);
  xhr.open("POST", "/api/media");
  if (ctx.apikey) xhr.setRequestHeader("x-ondemand-key", ctx.apikey);
  xhr.timeout = 90_000;
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) patch(id, { progress: Math.min(0.95, e.loaded / e.total) }); };
  xhr.onload = () => {
    xhrs.delete(id);
    let j: { ok?: boolean; code?: string; message?: string; media?: { id: string; extractedChars?: number; kind?: AttachmentKind; mime?: string; grounded?: "ondemand" | "local" }; note?: string } = {};
    try { j = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
    if (xhr.status >= 200 && xhr.status < 300 && j.ok && j.media?.id) {
      patch(id, { status: "ready", progress: 1, mediaId: j.media.id, extractedChars: j.media.extractedChars ?? 0, kind: j.media.kind ?? state.items.find((a) => a.id === id)?.kind, error: undefined, code: undefined, grounded: j.media.grounded ?? "ondemand", note: j.note });
      setLive(`${file.name} attached${j.media.extractedChars ? ` — ${j.media.extractedChars.toLocaleString()} characters extracted` : ""}`);
    } else {
      const code = j.code ?? (xhr.status === 413 ? "too_large" : xhr.status === 400 ? "unsupported_type" : xhr.status === 504 ? "upstream_timeout" : `http_${xhr.status || 0}`);
      const msg = j.message ?? (xhr.status ? `Upload failed (HTTP ${xhr.status})` : "Upload failed");
      patch(id, { status: "error", error: msg, code, retryable: !(code === "too_large" || code === "unsupported_type") });
      setLive(`${file.name}: ${msg}`);
    }
  };
  const netFail = (why: string) => () => { xhrs.delete(id); patch(id, { status: "error", error: why, code: "network_error", retryable: true }); setLive(`${file.name}: ${why}`); };
  xhr.onerror = netFail("Network error — check your connection and retry");
  xhr.ontimeout = netFail("Upload timed out — retry");
  xhr.onabort = () => { xhrs.delete(id); };
  xhr.send(fd);
}

export const attachmentsStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,
  items: () => state.items,
  ready: () => state.items.filter((a) => a.status === "ready" && a.mediaId),
  uploading: () => state.items.filter((a) => a.status === "uploading"),
  setSessionGetter(fn: () => SessionCtx) { sessionGetter = fn; },
  setDragging(on: boolean) { if (state.dragging !== on) { state = { ...state, dragging: on }; emit(); } },
  add(list: FileList | File[]) {
    const arr = Array.from(list); if (!arr.length) return;
    for (const file of arr) {
      const id = uid(); const pre = precheck(file);
      const ext = extOf(file.name);
      const item: AttachmentItem = { id, name: file.name, sizeBytes: file.size, mime: file.type, kind: pre.ok ? pre.kind : KIND_BY_EXT[ext] ?? "document", status: pre.ok ? "uploading" : "error", progress: 0, ...(pre.ok ? {} : { error: pre.message, code: pre.code, retryable: false }) };
      state = { ...state, items: [...state.items, item] };
      if (pre.ok) { files.set(id, file); setLive(`Uploading ${file.name} (${fmtSize(file.size)})`); upload(id); }
      else setLive(`${file.name}: ${pre.message}`);
    }
    emit();
  },
  retry(id: string) { const a = state.items.find((x) => x.id === id); if (!a || !files.get(id)) return; patch(id, { status: "uploading", progress: 0, error: undefined, code: undefined }); upload(id); },
  remove(id: string) {
    const a = state.items.find((x) => x.id === id);
    xhrs.get(id)?.abort(); xhrs.delete(id); files.delete(id);
    state = { ...state, items: state.items.filter((x) => x.id !== id) }; emit();
    if (a?.mediaId) { const ctx = sessionGetter(); void fetch(`/api/media?id=${encodeURIComponent(a.mediaId)}`, { method: "DELETE", headers: ctx.apikey ? { "x-ondemand-key": ctx.apikey } : {} }).catch(() => {}); }
  },
  clear() { for (const x of xhrs.values()) x.abort(); xhrs.clear(); files.clear(); state = { ...state, items: [] }; emit(); },
  /** Called by chat-shell after a successful send: move the ready items under the user message id (+ persist per thread) and clear the bar. */
  markSent(messageId: string, threadId: string) {
    const ready = attachmentsStore.ready().map((a): SentAttachment => ({ mediaId: a.mediaId!, name: a.name, kind: a.kind, extractedChars: a.extractedChars, sizeBytes: a.sizeBytes }));
    if (!ready.length) return [];
    const sent = { ...state.sent, [messageId]: ready };
    files.clear(); state = { ...state, sent, items: state.items.filter((a) => a.status !== "ready"), live: `${ready.length} attachment${ready.length === 1 ? "" : "s"} sent with your message` }; emit();
    if (threadId) { try { const cur = JSON.parse(localStorage.getItem(SENT_KEY(threadId)) ?? "{}") as Record<string, SentAttachment[]>; cur[messageId] = ready; localStorage.setItem(SENT_KEY(threadId), JSON.stringify(cur)); } catch { /* quota */ } }
    return ready;
  },
  sentFor(messageId: string): SentAttachment[] | undefined { return state.sent[messageId]; },
  /** Hydrate the per-message map for a thread from localStorage (called when a thread is selected). */
  hydrate(threadId: string) { try { const cur = JSON.parse(localStorage.getItem(SENT_KEY(threadId)) ?? "{}") as Record<string, SentAttachment[]>; if (Object.keys(cur).length) { state = { ...state, sent: { ...state.sent, ...cur } }; emit(); } } catch { /* ignore */ } },
};
export const useAttachments = () => useSyncExternalStore(attachmentsStore.subscribe, attachmentsStore.get, attachmentsStore.get);

function KindIcon({ kind, name, className }: { kind: AttachmentKind; name: string; className?: string }) {
  if (kind === "image") return <ImageIcon className={className} aria-hidden />;
  if (kind === "audio") return <Music className={className} aria-hidden />;
  const ext = extOf(name);
  if (ext === "xlsx" || ext === "csv") return <FileSpreadsheet className={className} aria-hidden />;
  return <FileText className={className} aria-hidden />;
}

function ProgressRing({ value }: { value: number }) {
  const r = 7; const c = 2 * Math.PI * r; const pct = Math.max(0, Math.min(1, value));
  return (
    <svg className="oiu-att__ring" viewBox="0 0 18 18" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
      <circle cx="9" cy="9" r={r} className="oiu-att__ring-track" />
      <circle cx="9" cy="9" r={r} className="oiu-att__ring-bar" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
    </svg>
  );
}

export function AttachmentChip({ a }: { a: AttachmentItem }) {
  const title = a.status === "error" ? a.error : a.status === "ready" ? `${a.name} · ${fmtSize(a.sizeBytes)}${a.extractedChars ? ` · ${a.extractedChars.toLocaleString()} chars extracted` : ""}${a.note ? ` · ${a.note}` : ""}` : `Uploading ${a.name} · ${Math.round(a.progress * 100)}%`;
  return (
    <li className={`oiu-att__chip oiu-att__chip--${a.status}`} data-testid="attachment-chip" data-status={a.status} data-kind={a.kind} data-code={a.code ?? ""} data-grounded={a.grounded ?? ""} title={title}>
      <span className="oiu-att__chip-icon"><KindIcon kind={a.kind} name={a.name} className="size-4" /></span>
      <span className="oiu-att__chip-body">
        <span className="oiu-att__chip-name">{a.name}{a.status === "ready" && a.grounded === "local" && <span className="oiu-att__badge" data-testid="attachment-local-badge" title={a.note ?? "Grounded locally from the uploaded text"}>local</span>}</span>
        <span className="oiu-att__chip-meta">{a.status === "error" ? a.error : a.status === "uploading" ? (a.progress >= 0.95 ? "Processing…" : `${fmtSize(a.sizeBytes)} · ${Math.round(a.progress * 100)}%`) : `${fmtSize(a.sizeBytes)}${a.extractedChars ? ` · ${a.extractedChars.toLocaleString()} chars` : ""}`}</span>
      </span>
      <span className="oiu-att__chip-state" aria-hidden>
        {a.status === "uploading" && (a.progress >= 0.95 ? <Loader2 className="size-3.5 oiu-att__spin" /> : <ProgressRing value={a.progress} />)}
        {a.status === "ready" && <Check className="size-3.5" />}
        {a.status === "error" && <AlertCircle className="size-3.5" />}
      </span>
      {a.status === "error" && a.retryable && <button type="button" className="oiu-att__retry" data-testid="attachment-retry" onClick={() => attachmentsStore.retry(a.id)}><RotateCcw className="size-3" aria-hidden /> Retry</button>}
      <button type="button" className="oiu-att__remove" aria-label={`Remove ${a.name}`} data-testid="attachment-remove" onClick={() => attachmentsStore.remove(a.id)}><X className="size-3.5" aria-hidden /></button>
    </li>
  );
}

/** Small read-only chips under a sent user message. */
export function SentChips({ items }: { items: SentAttachment[] }) {
  if (!items.length) return null;
  return (
    <ul className="oiu-att__sent" data-testid="message-attachments" aria-label="Attachments sent with this message">
      {items.map((s) => (
        <li key={s.mediaId} className="oiu-att__sent-chip" data-testid="message-attachment" data-kind={s.kind} data-media-id={s.mediaId} title={`${s.name}${s.extractedChars ? ` · ${s.extractedChars.toLocaleString()} chars extracted` : ""} · OnDemand media ${s.mediaId}`}>
          <KindIcon kind={s.kind} name={s.name} className="size-3.5" /> <span>{s.name}</span>
        </li>
      ))}
    </ul>
  );
}

/** Legacy export kept for API compatibility — the attachment UI now lives inside <AppComposer> (app-composer.tsx); nothing is portalled. */
export function AttachmentBar() { return null; }
