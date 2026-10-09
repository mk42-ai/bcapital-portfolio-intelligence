"use client";
import Image from "next/image";
import { Loader2, Check, Link2 } from "lucide-react";
import type { ChatMessage, MessagePart } from "@/lib/ondemand-client";
import { Badge } from "@/components/ui/badge";
import { HtmlPreview } from "./html-preview";
import { cn } from "@/lib/utils";
function renderText(text: string) {
  // Minimal, safe markdown-ish rendering: paragraphs, **bold**, `code`, fenced html → sandboxed preview, bare URLs → links.
  const blocks = text.split(/```(html)\n([\s\S]*?)```/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] === "html") { out.push(<HtmlPreview key={`h${i}`} html={blocks[i + 1] ?? ""} />); i++; continue; }
    const chunk = blocks[i]; if (!chunk?.trim()) continue;
    out.push(...chunk.split(/\n{2,}/).map((para, j) => (
      <p key={`${i}-${j}`} className="whitespace-pre-wrap leading-relaxed">
        {para.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)\]]+)/g).map((seg, k) => seg.startsWith("**") ? <strong key={k}>{seg.slice(2, -2)}</strong> : seg.startsWith("`") ? <code key={k} className="rounded bg-surface-3 px-1 font-mono text-[0.9em]">{seg.slice(1, -1)}</code> : /^https?:\/\//.test(seg) ? <a key={k} href={seg} target="_blank" rel="noopener noreferrer" className="break-all text-primary-soft underline-offset-2 hover:underline">{seg}</a> : seg)}
      </p>)));
  }
  return out;
}
export function Message({ m }: { m: ChatMessage }) {
  const user = m.role === "user";
  const sources = m.parts.filter((p): p is Extract<MessagePart, { type: "source-url" }> => p.type === "source-url");
  const tools = m.parts.filter((p): p is Extract<MessagePart, { type: "tool-invocation" }> => p.type === "tool-invocation");
  const reasoning = m.parts.find((p): p is Extract<MessagePart, { type: "reasoning" }> => p.type === "reasoning");
  const text = m.parts.filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text").map((p) => p.text).join("");
  return (
    <div className={cn("flex gap-3", user && "flex-row-reverse")}>
      {user ? <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground" aria-hidden>You</div> : <Image src="/brand/chat-avatar-128.webp" alt="" width={32} height={32} className="size-8 shrink-0 rounded-full" />}
      <div className={cn("max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-sm", user ? "bg-primary text-primary-foreground" : "card")}>
        {tools.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label="Tool calls">{tools.map((t, i) => <li key={i}><Badge tone={t.state === "done" ? "primary" : "info"}>{t.state === "done" ? <Check className="size-3" aria-hidden /> : <Loader2 className="size-3 animate-spin" aria-hidden />}{t.toolName}</Badge></li>)}</ul>}
        {reasoning && !user && <details className="text-xs text-muted"><summary className="cursor-pointer">Planning / reasoning</summary><p className="mt-1 whitespace-pre-wrap">{reasoning.text}</p></details>}
        {text ? renderText(text) : m.status === "submitted" || m.status === "streaming" ? <p className="flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />{m.status === "submitted" ? "Submitted — waiting for the model…" : "Streaming…"}</p> : null}
        {m.error && m.error !== "stopped" && <p role="alert" className="text-danger">{m.error}</p>}
        {m.error === "stopped" && <p className="text-xs text-muted">Stopped by you.</p>}
        {sources.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label="Sources">{sources.map((s, i) => { let h = s.url; try { h = new URL(s.url).hostname.replace(/^www\./, ""); } catch {} return <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer" className="chip border-border bg-surface-2 text-foreground hover:bg-surface-3"><Link2 className="size-3" aria-hidden />{s.title ?? h}<span className="sr-only"> (source, opens in new tab)</span></a></li>; })}</ul>}
      </div>
    </div>
  );
}
