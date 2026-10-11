"use client";
/** §8.7 FulfilmentThinking — "Writing the answer" (verbatim). */
import { useEffect, useRef } from "react";
import ComponentShadow from "./component-shadow";
import { Markdown } from "./markdown";
import StatusAccordion from "./status-accordion";
import type { BotMessageType } from "./types";

export default function FulfilmentThinking({ message, isStreaming }: { message: BotMessageType; isStreaming: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [message.fulfillmentThinking]);
  return (
    <StatusAccordion status={isStreaming ? "loading" : "none"} title="Writing the answer">
      <div className="relative">
        <div ref={ref} className="yScrollbar max-h-[40vh] overflow-y-auto text-sm text-neutral-400 dark:text-white/50">
          <Markdown content={message.fulfillmentThinking ?? ""} />
        </div>
        <ComponentShadow scrollRef={ref} />
      </div>
    </StatusAccordion>
  );
}
