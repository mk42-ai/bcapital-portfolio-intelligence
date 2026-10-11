"use client";
/**
 * /chat-od — the ported OnDemand streaming chat (spec §1–§10), alongside /chat for side-by-side comparison. The composer is not part of
 * the spec: it is a minimal textarea + send/stop so the thread can be driven.
 */
import { ArrowUp, Plus, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ChatComponent from "./chat-component";
import { CodePreviewDrawer, CodePreviewProvider } from "./code-preview";
import { Toaster } from "./toast";
import type { UserMessageType } from "./types";
import { useOdStream } from "./use-od-stream";

export default function OdChatPage() {
  const {
    messages,
    setMessages,
    isLoading,
    isInputDisabled,
    handleSubmit,
    stop,
    newChat,
  } = useOdStream();
  const [draft, setDraft] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const lastIndex = messages.length - 1;

  // Follow the stream while the reader is at (or near) the bottom; leave them alone once they scroll up.
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    const el = chatContainerRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    if (!draft.trim() || isInputDisabled) return;
    stickRef.current = true;
    void handleSubmit(draft);
    setDraft("");
  };

  return (
    <CodePreviewProvider>
      <div
        className="od-chat flex min-h-0 flex-1 bg-bgColor text-neutral-800"
        data-testid="od-chat"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border1 px-4 py-2">
            <h1 className="text-sm font-semibold">
              OnDemand chat{" "}
              <span className="font-normal text-neutral-400">
                · port preview
              </span>
            </h1>
            <button
              type="button"
              onClick={newChat}
              className="flex items-center gap-1 rounded-md border border-border1 bg-card px-2.5 py-1 text-xs hover:border-primary-400"
            >
              <Plus className="size-3.5" /> New chat
            </button>
          </div>
          <div
            ref={chatContainerRef}
            className="yScrollbar relative min-h-0 flex-1 overflow-y-auto"
            data-testid="od-thread"
          >
            <div className="mx-auto flex w-full max-w-[920px] flex-col px-4 pb-6">
              {!messages.length && (
                <p className="mt-24 text-center text-sm text-neutral-400">
                  Ask about any portfolio company…
                </p>
              )}
              {messages.map((message, index) => {
                const prev = messages[index - 1];
                return (
                  <ChatComponent
                    key={`${index}-${message.author}`}
                    message={message}
                    index={index}
                    lastIndex={lastIndex}
                    isLoading={isLoading}
                    isLastMessage={index === lastIndex}
                    setMessages={setMessages}
                    chatContainerRef={chatContainerRef}
                    UserMessage={
                      prev?.author === "user"
                        ? (prev as UserMessageType)
                        : undefined
                    }
                    handleSubmit={handleSubmit}
                  />
                );
              })}
            </div>
          </div>
          <form
            className="mx-auto w-full max-w-[920px] px-4 pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="flex items-end gap-2 rounded-xl   bg-card p-2 focus-within:border-primary-400">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Ask about any portfolio company…"
                aria-label="Message"
                className="max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
              />
              {isLoading ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop"
                  className="flex size-9 items-center justify-center rounded-lg bg-neutral-800 text-white"
                >
                  <Square className="size-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim() || isInputDisabled}
                  aria-label="Send"
                  className="flex size-9 items-center justify-center rounded-lg bg-primary-500 text-white disabled:opacity-40"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </form>
        </div>
        <CodePreviewDrawer />
        <Toaster />
      </div>
    </CodePreviewProvider>
  );
}
