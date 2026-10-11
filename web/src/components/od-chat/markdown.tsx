"use client";
/**
 * §8.9 answer rendering. `Markdown` is the thinking-panel renderer; `MarkdownAnswer` splits the answer on fenced code blocks, renders text
 * parts through per-block memoised markdown (only the block that is streaming re-parses) and code parts as clickable cards.
 * `markdownComponents` is not given by the spec — the minimal element styling below restores list/link/table rendering under Tailwind preflight.
 */
import { CodeIcon, ExternalLinkIcon } from "lucide-react";
import { memo, useMemo, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { twMerge } from "tailwind-merge";
import { useCodePreview } from "./code-preview";
import Loader from "./loader";

const markdownComponents: Components = {
  a: ({ node: _n, ...p }: ComponentProps<"a"> & { node?: unknown }) => <a {...p} target="_blank" rel="noopener noreferrer" className="text-primary-500 underline underline-offset-2" />,
  ul: ({ node: _n, ...p }: ComponentProps<"ul"> & { node?: unknown }) => <ul {...p} className="list-disc pl-5" />,
  ol: ({ node: _n, ...p }: ComponentProps<"ol"> & { node?: unknown }) => <ol {...p} className="list-decimal pl-5" />,
  table: ({ node: _n, ...p }: ComponentProps<"table"> & { node?: unknown }) => <div className="overflow-x-auto"><table {...p} className="border-collapse text-sm" /></div>,
  th: ({ node: _n, ...p }: ComponentProps<"th"> & { node?: unknown }) => <th {...p} className="border border-border1 px-2 py-1 text-left" />,
  td: ({ node: _n, ...p }: ComponentProps<"td"> & { node?: unknown }) => <td {...p} className="border border-border1 px-2 py-1" />,
};

/** Thinking-panel markdown. */
export const Markdown = ({ content }: { content: string }) => (
  <div className="w-full"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</ReactMarkdown></div>
);

const LIST_ITEM_START = /^([*+-]|\d{1,9}[.)])(\s|$)/;
const HAS_LIST_ITEM = /^\s*([*+-]|\d{1,9}[.)])\s/m;
const HAS_DEFINITION = /^ {0,3}\[[^\]]+\]:\s/m;
const TILDE_FENCE = /^ {0,3}~~~/gm;

export const splitMarkdownBlocks = (text: string): string[] => {
  if (!text.includes("\n\n") || HAS_DEFINITION.test(text)) return [text];
  const blocks: string[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const previous = blocks[blocks.length - 1];
    const continuesPrevious =
      previous !== undefined &&
      (/^\s/.test(chunk) ||
        (LIST_ITEM_START.test(chunk) && HAS_LIST_ITEM.test(previous)) ||
        (previous.match(TILDE_FENCE)?.length ?? 0) % 2 === 1);
    if (continuesPrevious) blocks[blocks.length - 1] = `${previous}\n\n${chunk}`;
    else blocks.push(chunk);
  }
  return blocks;
};
const MarkdownBlock = memo(({ text }: { text: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown>
));
MarkdownBlock.displayName = "MarkdownBlock";

const MemoMarkdown = memo(({ text }: { text: string }) => {
  const blocks = useMemo(() => splitMarkdownBlocks(text), [text]);
  return <div data-reply-enabled="true">{blocks.map((b, i) => <MarkdownBlock key={i} text={b} />)}</div>;
});
MemoMarkdown.displayName = "MemoMarkdown";

type Part = { kind: "text"; text: string } | { kind: "code"; language: string; code: string; closed: boolean };

/** Split on ``` fences; an unterminated trailing fence is a code part that is still streaming. */
export const splitCodeFences = (text: string): Part[] => {
  const parts: Part[] = [];
  let i = 0;
  while (i < text.length) {
    const s = text.indexOf("```", i);
    if (s === -1) { parts.push({ kind: "text", text: text.slice(i) }); break; }
    if (s > i) parts.push({ kind: "text", text: text.slice(i, s) });
    const nl = text.indexOf("\n", s + 3);
    if (nl === -1) { parts.push({ kind: "code", language: text.slice(s + 3).trim(), code: "", closed: false }); break; }
    const language = text.slice(s + 3, nl).trim();
    const e = text.indexOf("```", nl + 1);
    if (e === -1) { parts.push({ kind: "code", language, code: text.slice(nl + 1), closed: false }); break; }
    parts.push({ kind: "code", language, code: text.slice(nl + 1, e), closed: true });
    i = e + 3;
  }
  return parts;
};

const CodeCard = ({ blockKey, language, code, isCurrentBlockStreaming }: { blockKey: string; language: string; code: string; isCurrentBlockStreaming: boolean }) => {
  const { preview, open } = useCodePreview();
  const isSelected = preview?.key === blockKey;
  const openCodePreview = () => open({ key: blockKey, language, code });
  return (
    <div className="mt-2 overflow-hidden rounded-md">
      <button className="w-full overflow-hidden rounded-md" onClick={openCodePreview}>
        <div className={twMerge(
          "my-1 flex w-full items-center justify-between gap-2 rounded-md border dark:border-[#2a2a2a] border-neutral-200 dark:bg-neutral-800 bg-sidebarBg px-3 py-2 hover:dark:border-primary-700 hover:border-neutral-200 hover:bg-header",
          isCurrentBlockStreaming && "opacity-80",
          isSelected && "border-primary-500 bg-primary-500/50 hover:border-primary-500 dark:border-primary-500 dark:bg-primary-500/15 hover:dark:border-primary-500")}>
          <span className="flex items-center gap-2">
            {isCurrentBlockStreaming && <Loader className="size-6 [&_svg]:h-6 [&_svg]:w-6" />}
            <div className="flex size-6 items-center justify-center gap-2 rounded bg-primary-500"><CodeIcon className="size-4 text-white" /></div>
            <div className="flex items-center gap-2 text-left text-sm font-medium"><span className="text-sm font-medium uppercase leading-none">{language}</span></div>
          </span>
          <ExternalLinkIcon className="size-4 text-neutral-400" />
        </div>
      </button>
    </div>
  );
};

/** The final answer (`message.message`). */
export const MarkdownAnswer = ({ text, messageId = "", isStreaming = false }: { text: string; messageId?: string; isStreaming?: boolean }) => {
  const parts = useMemo(() => splitCodeFences(text || ""), [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "text"
          ? <MemoMarkdown key={i} text={p.text} />
          : <CodeCard key={i} blockKey={`${messageId}:${i}`} language={p.language || "code"} code={p.code} isCurrentBlockStreaming={isStreaming && !p.closed && i === parts.length - 1} />,
      )}
    </>
  );
};
