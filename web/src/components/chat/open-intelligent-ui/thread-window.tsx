"use client";
/**
 * Thread windowing (Agent 22): marks every message root beyond the last KEEP messages with data-windowed="true" so canvas.css can apply
 * `content-visibility:auto` — long threads stay cheap to lay out while the DOM (and scroll anchoring) stays intact. Pure DOM pass, runs
 * after each message-count change; never touches the last KEEP rows (the live/streaming ones).
 */
import { useEffect } from "react";
import { useThread } from "@openuidev/react-ui";
export const KEEP = 12;
const ROW = ".chat-shell .openui-agent-thread-messages > *";
export function ThreadWindow() {
  const count = useThread((s) => s.messages.length);
  useEffect(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(ROW));
    rows.forEach((el, i) => { if (i < rows.length - KEEP) el.setAttribute("data-windowed", "true"); else el.removeAttribute("data-windowed"); });
  }, [count]);
  return null;
}
