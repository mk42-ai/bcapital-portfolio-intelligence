"use client";
/** OpenUI-style sandboxed preview for LLM-generated HTML snippets: srcdoc iframe with a strict sandbox (no scripts, no same-origin). */
export function HtmlPreview({ html, title = "Generated UI preview" }: { html: string; title?: string }) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:12px;color:#0a211a;background:#fff}</style></head><body>${html}</body></html>`;
  return <iframe title={title} sandbox="" srcDoc={doc} className="h-64 w-full rounded-lg border border-border bg-white" loading="lazy" referrerPolicy="no-referrer" />;
}
