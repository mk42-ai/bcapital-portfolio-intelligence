"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, ExternalLink, FileSpreadsheet, FileText, FileType, Film, ImageIcon, Presentation, X } from "lucide-react";
import { closeSidePane, useSidePane, type SidePaneItem } from "./side-pane-store";
import { PdfPages, PreviewUnavailable } from "@/components/artifacts/pdf-pages";
import "./media.css";

type DocFormat = "pdf" | "office" | "text" | "html" | "unknown";
const TEXT_CAP = 200 * 1024;

function docFormat(item: SidePaneItem): { fmt: DocFormat; label: string; Icon: typeof FileText } {
  const mime = (item.mime ?? "").toLowerCase(); const name = (item.title ?? "").toLowerCase();
  let path = ""; try { path = new URL(item.src, typeof window === "undefined" ? "http://x" : window.location.href).pathname.toLowerCase(); } catch { /* ignore */ }
  const ext = (name.match(/\.([a-z0-9]+)$/)?.[1] ?? path.match(/\.([a-z0-9]+)$/)?.[1] ?? "");
  if (mime === "application/pdf" || ext === "pdf") return { fmt: "pdf", label: "PDF", Icon: FileText };
  if (/wordprocessingml|msword/.test(mime) || ext === "docx" || ext === "doc") return { fmt: "office", label: "Word document", Icon: FileType };
  if (/spreadsheetml|ms-excel/.test(mime) || ext === "xlsx" || ext === "xls") return { fmt: "office", label: "Excel spreadsheet", Icon: FileSpreadsheet };
  if (/presentationml|ms-powerpoint/.test(mime) || ext === "pptx" || ext === "ppt") return { fmt: "office", label: "PowerPoint deck", Icon: Presentation };
  if (mime === "text/html" || ext === "html" || ext === "htm") return { fmt: "html", label: "HTML", Icon: FileText };
  if (mime.startsWith("text/") || /json|xml|csv|markdown|yaml/.test(mime) || ["txt", "md", "markdown", "csv", "tsv", "json", "log", "yaml", "yml", "xml"].includes(ext)) return { fmt: "text", label: ext ? ext.toUpperCase() : "Text", Icon: FileText };
  return { fmt: "unknown", label: ext ? ext.toUpperCase() : "File", Icon: FileText };
}
const fmtSize = (n?: number) => n == null ? null : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

function NoPreview({ item, Icon, label, message, error }: { item: SidePaneItem; Icon: typeof FileText; label: string; message: string; error?: boolean }) {
  const size = fmtSize(item.size);
  return (
    <div className="mp-pane-empty" data-testid="side-pane-no-preview" data-error={error ? "" : undefined}>
      <span className="mp-pane-icon"><Icon aria-hidden /></span>
      <strong>{item.title}</strong>
      <span>{label}{size ? ` · ${size}` : ""}</span>
      <span>{message}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <a className="mp-pane-cta" href={item.downloadUrl ?? item.src} download target="_blank" rel="noopener noreferrer" data-testid="side-pane-no-preview-download"><Download className="size-4" aria-hidden />Download</a>
        <a className="mp-pane-cta mp-pane-cta-ghost" href={item.src} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" aria-hidden />Open in new tab</a>
      </div>
    </div>
  );
}

function TextBody({ item }: { item: SidePaneItem }) {
  const [state, setState] = useState<{ text?: string; truncated?: boolean; error?: string }>({});
  useEffect(() => {
    const ctrl = new AbortController(); setState({});
    fetch(item.src, { signal: ctrl.signal }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = await r.arrayBuffer(); const truncated = buf.byteLength > TEXT_CAP;
      const text = new TextDecoder().decode(truncated ? buf.slice(0, TEXT_CAP) : buf);
      setState({ text, truncated });
    }).catch((e: unknown) => { if (!ctrl.signal.aborted) setState({ error: e instanceof Error ? e.message : String(e) }); });
    return () => ctrl.abort();
  }, [item.src]);
  const { Icon, label } = docFormat(item);
  if (state.error) return <NoPreview item={item} Icon={Icon} label={label} message={`Could not load this file (${state.error}).`} error />;
  if (state.text == null) return <div className="mp-pane-empty" aria-busy="true">Loading…</div>;
  return <pre className="mp-pane-pre" data-testid="side-pane-text">{state.text}{state.truncated ? "\n\n… (truncated at 200 KB — download for the full file)" : ""}</pre>;
}

function PdfBody({ item }: { item: SidePaneItem }) {
  // pdf.js pages (canvas per page, DPR-aware, lazy) — works in every browser, including ones without a PDF plugin (Android Chrome). On any
  // error <PdfPages> shows the preview-unavailable fallback with Tab / Download actions (the pane itself is already the "pane").
  return (
    <div className="mp-pane-pdf" data-testid="side-pane-pdf" aria-label={item.title}>
      <PdfPages src={item.src} title={item.title} fallbackActions={{ tabHref: item.src, downloadHref: item.downloadUrl ?? item.src }} />
    </div>
  );
}

function Body({ item }: { item: SidePaneItem }) {
  if (item.kind === "image") return (
    <div className="mp-pane-stage"><img src={item.src} alt={item.title} data-testid="side-pane-image" /></div>
  );
  if (item.kind === "video") return (
    <>
      <div className="mp-pane-stage">
        <video key={item.src} src={item.src} poster={item.poster} controls playsInline autoPlay preload="metadata" aria-label={item.title} data-testid="side-pane-video">Your browser cannot play this video.</video>
      </div>
      <p className="mp-pane-caption" data-testid="side-pane-video-title">{item.title}</p>
    </>
  );
  const { fmt, label } = docFormat(item);
  if (fmt === "pdf") return <PdfBody item={item} />;
  if (fmt === "text") return <TextBody item={item} />;
  if (fmt === "html") return <iframe src={item.src} title={item.title} className="mp-pane-frame" sandbox="" data-testid="side-pane-html" />;
  // docx / xlsx / pptx / unknown: same preview-unavailable icon + copy as the Artifacts page, with Tab / Download.
  return (
    <div className="mp-pane-pdf" data-testid="side-pane-no-preview" data-format={fmt} aria-label={`${label} · ${item.title}`}>
      <PreviewUnavailable title={item.title} message="Preview not available for this format — download or open in a new tab" actions={{ tabHref: item.src, downloadHref: item.downloadUrl ?? item.src }} testId="preview-unavailable" />
    </div>
  );
}

/** Right-hand preview pane beside the chat (≥1024px) / full-screen sheet below. Mount once in /chat as a sibling of .chat-canvas inside .chat-row. */
export function SidePane() {
  const item = useSidePane();
  const ref = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const open = !!item;
  useEffect(() => {
    if (!open) return;
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("[data-testid=side-pane-close]")?.focus(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[data-testid=lightbox]")) { e.preventDefault(); closeSidePane(); } };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", onKey); const o = openerRef.current; openerRef.current = null; if (o && o.isConnected) o.focus?.(); };
  }, [open]);
  if (!item) return null;
  const KindIcon = item.kind === "image" ? ImageIcon : item.kind === "video" ? Film : docFormat(item).Icon;
  const light = item.kind === "document";
  return (
    <aside ref={ref} className="mp-pane mp-root" role="complementary" aria-label="Preview" data-testid="side-pane" data-kind={item.kind} tabIndex={-1}>
      <header className="mp-pane-head">
        <button type="button" className="mp-icon-btn mp-pane-back" onClick={closeSidePane} aria-label="Back to chat" data-testid="side-pane-back"><ArrowLeft className="size-5" aria-hidden /></button>
        <span className="mp-pane-icon"><KindIcon className="size-4" aria-hidden /></span>
        <h2 className="mp-pane-title" title={item.title} data-testid="side-pane-title">{item.title}</h2>
        <div className="mp-pane-actions">
          <a className="mp-icon-btn" href={item.src} target="_blank" rel="noopener noreferrer" aria-label="Open in new tab" title="Open in new tab" data-testid="side-pane-open"><ExternalLink className="size-4" aria-hidden /></a>
          <a className="mp-icon-btn" href={item.downloadUrl ?? item.src} download target="_blank" rel="noopener noreferrer" aria-label="Download" title="Download" data-testid="side-pane-download"><Download className="size-4" aria-hidden /></a>
          <button type="button" className="mp-icon-btn" onClick={closeSidePane} aria-label="Close preview (Esc)" title="Close (Esc)" data-testid="side-pane-close"><X className="size-5" aria-hidden /></button>
        </div>
      </header>
      <div className="mp-pane-body" data-light={light ? "" : undefined}><Body key={`${item.kind}:${item.src}`} item={item} /></div>
    </aside>
  );
}
