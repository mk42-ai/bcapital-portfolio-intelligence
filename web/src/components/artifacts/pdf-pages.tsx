"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, PanelRight } from "lucide-react";
import "./artifacts.css";

type PdfJs = typeof import("pdfjs-dist");
type PdfDoc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>;

let pdfjsPromise: Promise<PdfJs> | null = null;
/** Loaded once per tab (legacy build = widest browser support); the worker is the copy at web/public/pdf.worker.min.mjs. */
export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      const lib = m as unknown as PdfJs;
      lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return lib;
    }).catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

export type PdfPagesState = "loading" | "ready" | "error";
export type PdfFallbackActions = { onOpenPane?: () => void; tabHref?: string; downloadHref?: string; onTab?: () => void; onDownload?: () => void };

/** Fallback body (also used for docx/xlsx/pptx): preview-unavailable icon + copy + Open in pane / Tab / Download. */
export function PreviewUnavailable({ title, message = "Preview unavailable", actions, testId = "preview-unavailable" }: { title?: string; message?: string; actions?: PdfFallbackActions; testId?: string }) {
  const a = actions ?? {};
  return (
    <div className="art-preview-fallback art-pdf-fallback" data-testid={testId} role="status">
      <img src="/icons/preview-unavailable.png" alt="" width={64} height={64} loading="lazy" decoding="async" data-testid="preview-unavailable-icon" />
      {title && <strong className="art-pdf-fallback-title" title={title}>{title}</strong>}
      <p>{message}</p>
      <div className="art-card-actions art-pdf-fallback-actions">
        {a.onOpenPane && <button type="button" className="art-btn" onClick={a.onOpenPane} data-testid="preview-open-pane"><PanelRight aria-hidden />Open in pane</button>}
        {(a.tabHref || a.onTab) && (a.onTab
          ? <button type="button" className="art-btn" onClick={a.onTab} data-testid="preview-open-tab" title="Open in a new tab"><img src="/icons/open-externally.png" alt="" width={14} height={14} className="art-btn-icon-img" />Tab</button>
          : <a className="art-btn" href={a.tabHref} target="_blank" rel="noopener noreferrer" data-testid="preview-open-tab" title="Open in a new tab"><img src="/icons/open-externally.png" alt="" width={14} height={14} className="art-btn-icon-img" />Tab</a>)}
        {(a.downloadHref || a.onDownload) && (a.onDownload
          ? <button type="button" className="art-btn is-primary" onClick={a.onDownload} data-testid="preview-download"><Download aria-hidden />Download</button>
          : <a className="art-btn is-primary" href={a.downloadHref} download data-testid="preview-download"><Download aria-hidden />Download</a>)}
      </div>
    </div>
  );
}

function PageCanvas({ doc, index, width, dpr, onError }: { doc: PdfDoc; index: number; width: number; dpr: number; onError: (e: unknown) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null); // height / width of the page, known after the first render
  const pageRef = useRef<PdfPage | null>(null);
  const taskRef = useRef<{ cancel: () => void } | null>(null);
  // Lazy: only pages near the viewport are rendered (rootMargin one screen ahead).
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || width <= 0) return;
    let live = true;
    (async () => {
      try {
        const page = pageRef.current ?? (pageRef.current = await doc.getPage(index));
        if (!live) return;
        const base = page.getViewport({ scale: 1 });
        const scale = width / base.width;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current; if (!canvas) return;
        canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${Math.floor(vp.width)}px`; canvas.style.height = `${Math.floor(vp.height)}px`;
        setRatio(vp.height / vp.width);
        const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("canvas 2d context unavailable");
        taskRef.current?.cancel();
        const task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        taskRef.current = task;
        await task.promise;
        if (live) canvas.dataset.rendered = "true";
      } catch (e) {
        if (live && !(e && typeof e === "object" && (e as { name?: string }).name === "RenderingCancelledException")) onError(e);
      }
    })();
    return () => { live = false; taskRef.current?.cancel(); taskRef.current = null; };
  }, [doc, index, width, dpr, visible, onError]);
  const placeholderH = ratio ? Math.floor(width * ratio) : Math.floor(width * 1.294); // A4 ratio until measured
  return (
    <figure ref={wrapRef} className="art-pdf-page" data-testid="pdf-page-wrap" data-page={index}>
      <canvas ref={canvasRef} className="art-pdf-canvas" data-testid="pdf-page" data-page={index} aria-label={`Page ${index}`} style={{ minHeight: placeholderH }} />
      <figcaption className="art-pdf-caption">Page {index} / {doc.numPages}</figcaption>
    </figure>
  );
}

/**
 * Inline PDF pages with pdf.js (legacy build, worker from /pdf.worker.min.mjs). Fetches `src` as an ArrayBuffer (same-origin
 * /api/artifacts/<id>/content), renders each page to a DPR-aware <canvas> fitted to the container width (ResizeObserver, 150 ms debounce),
 * lazily via IntersectionObserver, with a "Page n / N" caption. On ANY error the fallback (preview-unavailable icon + actions) renders and
 * `onFallback` fires. data-state="loading|ready|error", data-page-count.
 */
export function PdfPages({ src, title, onFallback, maxPages = 20, fallbackActions, className }: { src: string; title: string; onFallback?: (error: unknown) => void; maxPages?: number; fallbackActions?: PdfFallbackActions; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [state, setState] = useState<PdfPagesState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [dpr, setDpr] = useState(1);
  const fallbackRef = useRef(onFallback); fallbackRef.current = onFallback;
  const fail = useCallback((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg); setState("error");
    fallbackRef.current?.(e);
  }, []);
  // Load the document.
  useEffect(() => {
    let live = true; let loaded: PdfDoc | null = null;
    setDoc(null); setState("loading"); setError(null);
    (async () => {
      try {
        const [lib, res] = await Promise.all([loadPdfJs(), fetch(src, { credentials: "same-origin" })]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        if (!live) return;
        const task = lib.getDocument({ data, isEvalSupported: false });
        loaded = await task.promise;
        if (!live) { void loaded.destroy(); return; }
        if (loaded.numPages < 1) throw new Error("empty document");
        setDoc(loaded); setState("ready");
      } catch (e) { if (live) fail(e); }
    })();
    return () => { live = false; if (loaded) void loaded.destroy(); };
  }, [src, fail]);
  // Fit to the container width (debounced) + DPR.
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    setDpr(Math.min(window.devicePixelRatio || 1, 3));
    let t: number | null = null;
    const apply = () => { const w = Math.floor(el.clientWidth - 2); if (w > 0) setWidth((prev) => (Math.abs(prev - w) < 2 ? prev : w)); };
    apply();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", apply); return () => window.removeEventListener("resize", apply); }
    const ro = new ResizeObserver(() => { if (t) window.clearTimeout(t); t = window.setTimeout(apply, 150); });
    ro.observe(el);
    return () => { ro.disconnect(); if (t) window.clearTimeout(t); };
  }, []);
  const count = doc?.numPages ?? 0;
  const shown = Math.min(count, maxPages);
  return (
    <div ref={rootRef} className={["art-pdf-pages", className].filter(Boolean).join(" ")} data-testid="pdf-pages" data-state={state} data-page-count={count || undefined} aria-busy={state === "loading" || undefined} aria-label={`${title} — ${count ? `${count} page${count === 1 ? "" : "s"}` : "PDF"}`}>
      {state === "loading" && (
        <div className="art-pdf-skeleton" data-testid="pdf-pages-skeleton" role="status" aria-label="Loading PDF pages">
          <div className="art-pdf-skeleton-page" /><div className="art-pdf-skeleton-page is-short" />
          <span className="art-pdf-caption">Rendering pages…</span>
        </div>
      )}
      {state === "error" && <PreviewUnavailable title={title} message={`Preview unavailable${error ? ` (${error.slice(0, 120)})` : ""}`} actions={fallbackActions} />}
      {state === "ready" && doc && width > 0 && Array.from({ length: shown }, (_, i) => <PageCanvas key={`${src}:${i + 1}`} doc={doc} index={i + 1} width={width} dpr={dpr} onError={fail} />)}
      {state === "ready" && count > shown && <p className="art-pdf-caption art-pdf-more" data-testid="pdf-pages-more">Showing the first {shown} of {count} pages — download or open in a tab for the rest.</p>}
    </div>
  );
}
