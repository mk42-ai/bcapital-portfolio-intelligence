"use client";
/** §8.4 ThinkingProcess — "Thinking" accordion (planning_thinking + planning_output). */
import { useEffect, useRef, useState, type RefObject } from "react";
import ComponentShadow from "./component-shadow";
import { Markdown } from "./markdown";
import StatusAccordion, { oneLineTail } from "./status-accordion";
import type { BotMessageType } from "./types";

export default function ThinkingProcess({ message, chatContainerRef, isStreaming }: {
  message: BotMessageType; chatContainerRef: RefObject<HTMLDivElement | null>; isStreaming: boolean;
}) {
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const [disableToggle, setDisableToggle] = useState(false);
  const thinkingContainerRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const thinking = message.thinking ?? "";
  const planningAnswer = message.planningAnswer ?? "";
  // Planning thinking is shown only until the plan arrives (plan_created); from then on StatusLogBlock shows the plan and step titles.
  const hasPlan = !!message.statusLogs?.some((l) => l.statusType === "plan_created");
  const isThinking = isStreaming && !disableToggle && !message.message?.trim();

  // Auto-collapse lock: once the LAST status log carries a stepQuery, close for good and scroll the thread to the bottom.
  useEffect(() => {
    if (disableToggle) return;
    const last = message.statusLogs?.[message.statusLogs.length - 1];
    if (last?.stepQuery?.trim()) {
      setIsThinkingOpen(false);
      setDisableToggle(true);
      const c = chatContainerRef.current;
      c?.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  // Stick to bottom while open: every content resize pins the scroll box to its end in one animation frame.
  useEffect(() => {
    if (!isThinkingOpen) return;
    const content = contentRef.current;
    const box = scrollBoxRef.current;
    if (!content || !box) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { box.scrollTop = box.scrollHeight - box.clientHeight; });
    });
    ro.observe(content);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [isThinkingOpen, message.thinking, message.pluginThinking, message.planningAnswer]);

  // On open: after 200 ms, bring the block into view inside the chat container if it is not fully visible.
  useEffect(() => {
    if (!isThinkingOpen) return;
    const t = setTimeout(() => {
      const el = thinkingContainerRef.current;
      const chatContainer = chatContainerRef.current;
      if (!el || !chatContainer) return;
      const er = el.getBoundingClientRect();
      const cr = chatContainer.getBoundingClientRect();
      if (er.top >= cr.top && er.bottom <= cr.bottom) return;
      let elementTop = 0;
      let node: HTMLElement | null = el;
      while (node && node !== chatContainer) { elementTop += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
      const max = chatContainer.scrollHeight - chatContainer.clientHeight;
      chatContainer.scrollTo({ top: Math.min(Math.max(elementTop - 20, 0), max), behavior: "smooth" });
    }, 200);
    return () => clearTimeout(t);
  }, [isThinkingOpen, chatContainerRef]);

  if (hasPlan || (!thinking.trim() && !planningAnswer.trim())) return null;

  return (
    <div ref={thinkingContainerRef} className="mb-0 w-full pb-0">
      <StatusAccordion
        title="Thinking"
        status={isThinking ? "loading" : "none"}
        isOpen={isThinkingOpen}
        disabled={disableToggle}
        onToggle={(open) => { if (!disableToggle) setIsThinkingOpen(open); }}
        preview={isThinking ? oneLineTail(thinking) : undefined}
      >
        {!disableToggle && (
          <div className="relative">
            <div ref={scrollBoxRef} className="yScrollbar max-h-[20vh] min-h-0 overflow-y-auto text-neutral-400">
              <div ref={contentRef} className="min-w-0 text-sm">
                <Markdown content={thinking} />
                {planningAnswer && <Markdown content={planningAnswer} />}
                <div className="h-px" />
              </div>
            </div>
            <ComponentShadow className="bg-bgColor" scrollRef={scrollBoxRef} />
          </div>
        )}
      </StatusAccordion>
    </div>
  );
}
