"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Eye, Trash2, PanelRight } from "lucide-react";
import { artifactsPanel, artifactsStore, type ArtifactProbe } from "@/lib/artifacts/store";
import { artifactStatus, formatBytes, relativeTime, type Artifact, type ArtifactStatus, type ArtifactVersions } from "@/lib/artifacts/types";
import { ArtifactIcon, iconFor, kindBadge } from "./artifact-icon";
import { openArtifactInPane } from "@/components/media/side-pane-store";
import "./artifacts.css";

/** Same-origin fallback href (inline previews and the no-JS path keep using it). */
export const downloadHref = (a: Artifact) => (a.contentUrl.startsWith("/api/artifacts/") ? `${a.contentUrl}?download=1` : a.contentUrl);

/** Confirm + DELETE. Returns true when removed. */
export async function confirmDeleteArtifact(a: Artifact): Promise<boolean> {
  if (typeof window !== "undefined" && !window.confirm(`Delete "${a.name}"${a.version > 1 ? ` (v${a.version})` : ""}? This cannot be undone.`)) return false;
  return artifactsStore.remove(a.id);
}

/**
 * Re-sign on open: ask /api/artifacts/<id>/signed-url for a FRESH OnDemand signed url (never the stored one) and open/download it; on any
 * failure the same-origin content url is used. The tab is opened synchronously (popup-blocker safe) and redirected once the url arrives.
 */
export async function openArtifact(a: Artifact, mode: "open" | "download"): Promise<string> {
  const fallback = mode === "download" ? downloadHref(a) : a.contentUrl;
  // "Open" = side-by-side preview next to the chat (documents/images/videos never navigate the app away; the pane has "Open in new tab" +
  // Download, both re-signed). Only "Download" leaves the page — through an <a download>, never window.location (a blocked popup must not
  // replace the chat with a PDF viewer; found by the QA harness at 1440×900).
  if (a.pending || !a.contentUrl.startsWith("/api/artifacts/")) { if (typeof window !== "undefined") window.open(fallback, "_blank", "noopener"); return fallback; }
  if (mode === "open") {
    // New tab: open synchronously (popup-blocker safe), then redirect to the fresh signed url. If the popup was blocked, fall back to the
    // side pane instead of navigating the app away.
    const win = typeof window !== "undefined" ? window.open("about:blank", "_blank", "noopener") : null;
    const res = await artifactsStore.signedUrl(a.id, false);
    const url = res.url || fallback;
    if (win && !win.closed) win.location.replace(url);
    else openArtifactInPane({ id: a.id, name: a.name, mime: a.mime, kind: a.kind, contentUrl: a.contentUrl, size: a.sizeBytes });
    return url;
  }
  const res = await artifactsStore.signedUrl(a.id, true);
  const url = res.url || fallback;
  if (typeof window !== "undefined") {
    const el = document.createElement("a"); el.href = url; el.rel = "noopener";
    if (res.source === "backend" || url.startsWith("/")) el.download = a.name; else el.target = "_blank";
    document.body.appendChild(el); el.click(); el.remove();
  }
  return url;
}

/** Green dot only when OnDemand really holds the file; grey "stored locally" otherwise — never a fake green for failed. */
export function MediaBadge({ a }: { a: Artifact }) {
  const stored = a.mediaStatus === "stored" && !!a.mediaId;
  const failed = a.mediaStatus === "failed" || a.failed;
  const label = stored ? "OnDemand media" : failed ? "stored locally · media failed" : "stored locally";
  return <span className={`art-badge art-badge-media${stored ? " is-stored" : failed ? " is-failed" : ""}`} data-testid="artifact-media-badge" data-media={stored ? "ondemand" : "local"} title={a.mediaMessage ?? (stored ? `OnDemand media ${a.mediaId}` : "Bytes live in the portfolio backend")}><i aria-hidden />{label}</span>;
}
export const sourceLabel = (a: Artifact) => (a.source === "upload" ? "input" : a.source === "agent" ? "agent" : "generated");

const STATUS_LABEL: Record<ArtifactStatus, string> = { verified: "Verified", processing: "Processing", local: "Stored locally", failed: "Failed" };
/**
 * Verified / status chip (matches the "verified deliverables" card pattern): green dot "Verified" only when the bytes are in the backend AND
 * (OnDemand media stored with an id, OR an agent/generated output whose content url answers); amber spinner while pending; grey for local
 * uploads; red when saving / media failed. `contentOk` comes from the card's lazy content probe (null = not probed yet ⇒ optimistic verified
 * for generated outputs, flips to "local" only if the probe fails).
 */
export function StatusChip({ a, contentOk }: { a: Artifact; contentOk?: boolean | null }) {
  const st = artifactStatus(a, contentOk);
  const title = st === "failed" ? (a.mediaMessage || "Saving failed") : st === "processing" ? "Still saving — storage has not confirmed yet" : st === "verified" ? (a.mediaId ? `Verified · OnDemand media ${a.mediaId}` : "Verified · bytes stored in the portfolio backend") : (a.mediaMessage ?? "Stored in the portfolio backend only (no OnDemand media)");
  return <span className={`art-badge art-badge-status is-${st}`} data-testid="artifact-status" data-status={st} title={title} role={st === "processing" ? "status" : undefined}><i aria-hidden className={st === "processing" ? "art-spin" : undefined} />{STATUS_LABEL[st]}</span>;
}

const TEXT_RE = /^(text\/|application\/(json|xml|x-yaml|yaml|csv|x-ndjson))/;
const isTextLike = (a: Artifact) => a.kind === "document" && (TEXT_RE.test(a.mime.toLowerCase()) || /\.(md|txt|csv|json|log|ya?ml|html?|xml)$/i.test(a.name));
const isPdf = (a: Artifact) => a.mime.toLowerCase().includes("pdf") || /\.pdf$/i.test(a.name);

/**
 * Preview snippet: one–two honest lines under the name. Text/markdown/csv/json → first 240 chars of /content (lazy, once the card scrolls into
 * view; one fetch per id, cached in the store, never for files > 2 MB); PDF → "Page preview on open" (the pane renders pdf.js pages); video / audio
 * → placeholder text; images keep the thumbnail. Nothing is rendered when the fetch fails — never fabricated content.
 */
export function ArtifactSnippet({ a, probe }: { a: Artifact; probe: ArtifactProbe | undefined }) {
  let text: string | null = null; let kind: string = "none";
  if (a.pending) return null;
  // Size + age live ONLY in the meta line (`vN · 25 KB · 1m ago`) — the snippet never repeats them.
  if (isPdf(a)) { text = "Page preview on open"; kind = "pdf"; }
  else if (a.kind === "video") { text = "Video · opens in the side pane"; kind = "video"; }
  else if (a.kind === "audio") { text = "Audio clip · plays in the side pane"; kind = "audio"; }
  else if (isTextLike(a)) { text = probe?.text ?? null; kind = "text"; }
  if (!text) return null;
  return <p className="art-card-snippet" data-testid="artifact-snippet" data-snippet={kind} title={kind === "text" ? "First lines of the file" : undefined}>{text}</p>;
}

/** Version history list under the card: vN · size · time · status · Download (that version's bytes). */
export function VersionHistory({ a, now, alwaysShow = false }: { a: Artifact; now: number | null; alwaysShow?: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ArtifactVersions | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const listId = `art-versions-${a.id}`;
  if (a.pending || (!alwaysShow && a.version <= 1)) return null;
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && data === undefined && !loading) { setLoading(true); try { setData(await artifactsStore.versions(a.id)); } finally { setLoading(false); } }
  };
  // v1 = nothing earlier to show: the toggle stays visible on the /artifacts page as disabled muted text (no fetch — honest, no empty list).
  const noEarlier = a.version <= 1;
  return (
    <div className="art-versions">
      <button type="button" className={`art-versions-toggle${open ? " is-open" : ""}`} onClick={toggle} aria-expanded={open} aria-controls={listId} data-testid="artifact-versions-toggle" data-version={a.version} disabled={noEarlier} title={noEarlier ? "This is the only version" : `Show all ${a.version} versions`}>
        <img src="/icons/version-history.png" alt="" width={24} height={24} className="art-versions-icon" loading="lazy" decoding="async" aria-hidden /><span>v{a.version} · {noEarlier ? "no earlier versions" : "history"}</span>
      </button>
      {open && (
        <div id={listId} className="art-versions-body">
          {loading && data === undefined && <p className="art-note" role="status">Loading versions…</p>}
          {data === null && <p className="art-error" role="status">Could not load the version history.</p>}
          {data && data.versions.length <= 1 && <p className="art-note">No earlier versions — this is the only copy.</p>}
          {data && data.versions.length > 0 && (
            <ul className="art-version-list" role="list" aria-label={`Versions of ${data.name}`}>
              {data.versions.map((v) => {
                const vs = artifactStatus({ pending: false, failed: false, mediaStatus: v.mediaStatus, mediaId: v.mediaId, source: v.source, contentUrl: v.contentUrl, sizeBytes: v.sizeBytes });
                return (
                  <li key={v.id} className={`art-version-row${v.id === a.id ? " is-current" : ""}`} data-testid="artifact-version-row" data-id={v.id} data-version={v.version} data-status={vs}>
                    <span className="art-badge art-badge-version">v{v.version}</span>
                    <span className="art-version-meta">{v.sizeBytes ? formatBytes(v.sizeBytes) : "—"}<span className="art-dot" aria-hidden> · </span>{now ? relativeTime(v.createdAt, now) : ""}{v.id === a.id && <><span className="art-dot" aria-hidden> · </span>current</>}</span>
                    <span className={`art-badge art-badge-status is-${vs}`} data-status={vs}><i aria-hidden />{STATUS_LABEL[vs]}</span>
                    <a className="art-btn art-version-dl" href={`${v.contentUrl}?download=1`} download={data.name} data-testid="artifact-version-download" title={`Download v${v.version}`}><Download aria-hidden />Download</a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Artifact card. `compact` = one-row inline variant for the chat run view (file_written / artifact_ready). Default Preview opens the global panel. `showHistory` forces the history toggle (the /artifacts page). */
export function ArtifactCard({ artifact: a, compact = false, selected = false, showHistory = false, onPreview, onDeleted }: { artifact: Artifact; compact?: boolean; selected?: boolean; showHistory?: boolean; onPreview?: (a: Artifact) => void; onDeleted?: (a: Artifact) => void }) {
  const [now, setNow] = useState<number | null>(null);
  const [thumbErr, setThumbErr] = useState(false);
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const [probe, setProbe] = useState<ArtifactProbe | undefined>(() => artifactsStore.inspectCached(a.id));
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  // Lazy content probe (snippet + "content url answers" for the verified chip): fires once the card is visible, once per id (store-cached).
  const wantProbe = !a.pending && !a.failed && a.contentUrl.startsWith("/api/artifacts/") && (isTextLike(a) || a.source !== "upload") && a.kind !== "image";
  useEffect(() => {
    if (!wantProbe || probe !== undefined) return;
    const el = rootRef.current; let live = true;
    const run = () => { void artifactsStore.inspect(a.id, a.contentUrl, a.sizeBytes, isTextLike(a)).then((r) => { if (live) setProbe(r); }); };
    if (!el || typeof IntersectionObserver === "undefined") { run(); return () => { live = false; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: "120px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [a.id, a.contentUrl, a.sizeBytes, wantProbe, probe]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = a.failed ? "failed" : a.pending ? "uploading" : "ok";
  const icon = iconFor(a.kind, a.mime, a.name, state, a.source);
  const preview = () => (onPreview ? onPreview(a) : artifactsPanel.open(a.id));
  const badge = kindBadge(a.kind, a.mime, a.name);
  const metaBits = [a.sizeBytes ? formatBytes(a.sizeBytes) : null, now ? relativeTime(a.createdAt, now) : null].filter(Boolean) as string[];
  const showThumb = a.kind === "image" && a.thumbnailUrl && !thumbErr && !a.pending && !compact;
  const act = async (mode: "open" | "download") => { if (busy) return; setBusy(mode); try { await openArtifact(a, mode); } finally { setBusy(null); } };
  const canOpen = !!a.contentUrl && !a.pending;
  const contentOk = probe === undefined ? null : probe.ok;
  const status = artifactStatus(a, contentOk);
  return (
    <article ref={rootRef} className={`art-card art-root${compact ? " is-compact" : ""}`} data-testid="artifact-card" data-kind={a.kind} data-icon={icon} data-id={a.id} data-thread={a.threadId ?? undefined} data-status={status} data-selected={selected ? "true" : "false"} aria-label={`${a.name}, ${badge}, v${a.version}, ${STATUS_LABEL[status]}, ${metaBits.join(", ")}`}>
      <div className="art-thumb" aria-hidden={showThumb ? undefined : true}>
        {showThumb ? <img src={a.thumbnailUrl!} alt="" loading="lazy" decoding="async" onError={() => setThumbErr(true)} /> : <ArtifactIcon name={icon} size={compact ? 28 : 36} />}
      </div>
      <div className="art-card-main">
        <div className="art-card-row">
          <p className="art-card-name" title={a.name}>{a.name}</p>
          <span className="art-badge art-badge-kind" data-testid="artifact-kind">{badge}</span>
          <StatusChip a={a} contentOk={contentOk} />
          {!compact && <span className={`art-badge art-badge-source is-${sourceLabel(a)}`} data-testid="artifact-source">{sourceLabel(a)}</span>}
        </div>
        {/* ONE meta line: [vN] · size · age (· media badge in the compact chat card). Size is never repeated by the snippet. */}
        <p className="art-card-meta" data-testid="artifact-meta">
          <span className="art-badge art-badge-version" data-testid="artifact-version" data-version={a.version} title={`Version ${a.version}`}>v{a.version}</span>
          {metaBits.map((b, i) => <span key={i} className="art-meta-bit"><span className="art-dot" aria-hidden> · </span>{b}</span>)}
          {compact && <span className="art-meta-bit"><span className="art-dot" aria-hidden> · </span><MediaBadge a={a} /></span>}
        </p>
        {!compact && <ArtifactSnippet a={a} probe={probe} />}
        {!compact && <div className="art-card-badges"><MediaBadge a={a} />{a.threadId && <span className="art-badge" title={a.threadId}>Thread {a.threadId.slice(0, 8)}</span>}</div>}
        {state !== "ok" && <span className={`art-card-status${state === "failed" ? " is-failed" : ""}`} role="status">{state === "failed" ? (a.mediaMessage || "Saving failed") : "Saving…"}</span>}
        {state === "ok" && a.mediaStatus === "failed" && !compact && <span className="art-card-status is-failed" role="status">{a.mediaMessage || "Saving to OnDemand media failed — stored in the backend"}</span>}
        <div className="art-card-actions">
          {!compact && <button type="button" className="art-btn" onClick={preview} data-testid="artifact-preview-btn" disabled={!a.contentUrl}><Eye aria-hidden />Preview</button>}
          {/* Documents open side-by-side with the chat (video plays there too; images contain-fit) — the pane re-signs the link on open. */}
          <button type="button" className="art-btn" onClick={() => { openArtifactInPane({ id: a.id, name: a.name, kind: a.kind, mime: a.mime, contentUrl: a.contentUrl, poster: a.kind === "video" ? a.thumbnailUrl : null, size: a.sizeBytes }); }} data-testid="artifact-open-pane" disabled={!canOpen} title="Open beside the chat"><PanelRight aria-hidden />Open</button>
          <button type="button" className="art-btn" onClick={() => act("open")} data-testid="artifact-open" disabled={!canOpen || busy === "open"} title="Open in a new tab (fresh signed url)"><ExternalLink aria-hidden />{busy === "open" ? "Opening…" : "Tab"}</button>
          <button type="button" className="art-btn" onClick={() => act("download")} data-testid="artifact-download" disabled={!canOpen || busy === "download"} title="Download (fresh signed url)"><Download aria-hidden />{busy === "download" ? "…" : "Download"}</button>
          {!compact && <button type="button" className="art-btn is-danger" data-testid="artifact-delete" onClick={async () => { if (await confirmDeleteArtifact(a)) onDeleted?.(a); }}><Trash2 aria-hidden />Delete</button>}
        </div>
        {!compact && <VersionHistory a={a} now={now} alwaysShow={showHistory} />}
      </div>
    </article>
  );
}
