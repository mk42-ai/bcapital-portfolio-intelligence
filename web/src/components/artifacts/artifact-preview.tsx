"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { Artifact } from "@/lib/artifacts/types";
import { VideoPlayer } from "@/components/media/video-player";
import { ArtifactIcon } from "./artifact-icon";
import { downloadHref } from "./artifact-card";
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

/** Inline preview by type: image → img, video → VideoPlayer, pdf → iframe, text/markdown → pre, html → sandboxed iframe, else icon + download. */
export function ArtifactPreview({ artifact: a, headerActions }: { artifact: Artifact; headerActions?: React.ReactNode }) {
  const m = a.mime.toLowerCase();
  let body: React.ReactNode;
  if (!a.contentUrl || a.pending) body = <div className="art-preview-fallback"><ArtifactIcon kind={a.kind} state={a.failed ? "failed" : "uploading"} size={64} /><p>{a.failed ? "This artifact could not be saved." : "Still saving — the preview appears once storage confirms."}</p></div>;
  else if (a.kind === "image" || m.startsWith("image/")) body = <img className="art-preview-img" src={a.contentUrl} alt={a.name} />;
  else if (a.kind === "video" || m.startsWith("video/")) body = <VideoPlayer src={a.contentUrl} title={a.name} />;
  else if (a.kind === "audio" || m.startsWith("audio/")) body = <audio controls preload="metadata" src={a.contentUrl}>Your browser cannot play this audio.</audio>;
  else if (isPdf(m, a.name)) body = <iframe className="art-preview-frame" src={a.contentUrl} title={`Preview of ${a.name}`} />;
  else if (isHtml(m, a.name)) body = <iframe className="art-preview-frame" src={a.contentUrl} title={`Preview of ${a.name}`} sandbox="" referrerPolicy="no-referrer" />;
  else if (isText(m, a.name)) body = <TextBody url={a.contentUrl} />;
  else body = <div className="art-preview-fallback"><ArtifactIcon kind={a.kind} source={a.source} size={64} /><p>No inline preview for this file type ({a.mime}).</p><a className="art-btn is-primary" href={downloadHref(a)} download={a.name}><Download aria-hidden />Download</a></div>;
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
