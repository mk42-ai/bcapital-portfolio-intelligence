"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import type { Artifact } from "@/lib/artifacts/types";
import { VideoPlayer } from "@/components/media/video-player";
import { ArtifactIcon } from "./artifact-icon";
import { openArtifact } from "./artifact-card";
import { PdfPages, PreviewUnavailable } from "./pdf-pages";
import { openArtifactInPane } from "@/components/media/side-pane-store";
import "./artifacts.css";

const isText = (m: string, n: string) => m.startsWith("text/plain") || m.includes("markdown") || m.includes("json") || m.includes("csv") || /\.(md|txt|csv|json|log)$/i.test(n);
const isHtml = (m: string, n: string) => m.includes("html") || /\.html?$/i.test(n);
const isPdf = (m: string, n: string) => m.includes("pdf") || /\.pdf$/i.test(n);

function TextBody({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true; setText(null); setErr(null);
    fetch(url).then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); const t = await r.text(); if (live) setText(t.length > 200_000 ? t.slice(0, 200_000) + "\n…(truncated)" : t); }).catch((e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, [url]);
  if (err) return <p className="art-error">Could not load preview ({err}).</p>;
  return <pre className="art-preview-pre">{text ?? "Loading…"}</pre>;
}

/** Inline preview by type: image → img, video → VideoPlayer, pdf → pdf.js pages, text/markdown → pre, html → sandboxed iframe, else icon + download. */
export function ArtifactPreview({ artifact: a, headerActions }: { artifact: Artifact; headerActions?: React.ReactNode }) {
  const m = a.mime.toLowerCase();
  const fallbackActions = { onOpenPane: () => openArtifactInPane({ id: a.id, name: a.name, kind: a.kind, mime: a.mime, contentUrl: a.contentUrl, size: a.sizeBytes }), onTab: () => void openArtifact(a, "open"), onDownload: () => void openArtifact(a, "download") };
  let body: React.ReactNode;
  if (!a.contentUrl || a.pending) body = <div className="art-preview-fallback"><ArtifactIcon kind={a.kind} mime={a.mime} fileName={a.name} state={a.failed ? "failed" : "uploading"} size={64} /><p>{a.failed ? "This artifact could not be saved." : "Still saving — the preview appears once storage confirms."}</p></div>;
  else if (a.kind === "image" || m.startsWith("image/")) body = <img className="art-preview-img" src={a.contentUrl} alt={a.name} />;
  else if (a.kind === "video" || m.startsWith("video/")) body = <VideoPlayer src={a.contentUrl} title={a.name} />;
  else if (a.kind === "audio" || m.startsWith("audio/")) body = <audio controls preload="metadata" src={a.contentUrl}>Your browser cannot play this audio.</audio>;
  // PDF → pdf.js pages rendered to canvases (no browser plugin needed; the fallback has preview-unavailable + Open in pane / Tab / Download).
  else if (isPdf(m, a.name)) body = <div className="art-preview-pdf" data-testid="artifact-preview-pdf"><PdfPages src={a.contentUrl} title={a.name} fallbackActions={fallbackActions} /></div>;
  else if (isHtml(m, a.name)) body = <iframe className="art-preview-frame" src={a.contentUrl} title={`Preview of ${a.name}`} sandbox="" referrerPolicy="no-referrer" />;
  else if (isText(m, a.name)) body = <TextBody url={a.contentUrl} />;
  else body = <PreviewUnavailable title={a.name} message="Preview not available for this format — download or open in a new tab" actions={fallbackActions} />;
  return (
    <section className="art-preview art-root" data-testid="artifact-preview" data-id={a.id} aria-label={`Preview: ${a.name}`}>
      <div className="art-preview-head">
        <h3 className="art-preview-title" title={a.name}>{a.name}{a.version > 1 ? ` · v${a.version}` : ""}</h3>
        {headerActions}
      </div>
      {body}
    </section>
  );
}
