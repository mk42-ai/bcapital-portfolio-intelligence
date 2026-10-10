"use client";
/** Floating scroll-to-bottom (Agent 23): follows the stream only while the user is at the bottom; otherwise a pill ABOVE the composer that never overlaps text. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useThread } from "@openuidev/react-ui";
import { ArrowDown } from "lucide-react";
import { useStreamState } from "./stream-store";

/** Scroll anchoring: follow the stream only while the user is at the bottom; otherwise show a "jump to latest" pill. */
export function ScrollAnchor() {
  const isRunning = useThread((s) => s.isRunning); const st = useStreamState(); const count = useThread((s) => s.messages.length);
  const [away, setAway] = useState(false); const atBottom = useRef(true); const el = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => document.querySelector<HTMLElement>(".chat-shell .openui-agent-thread-scroll-area");
    el.current = find(); if (!el.current) return;
    const node = el.current;
    const onScroll = () => { const gap = node.scrollHeight - node.scrollTop - node.clientHeight; atBottom.current = gap < 120; setAway((a) => (a !== !atBottom.current ? !atBottom.current : a)); };
    node.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    return () => node.removeEventListener("scroll", onScroll);
  }, [isRunning, count]);
  // Follow-to-bottom with an INSTANT scrollTop write (OpenUI's own smooth scrollTo lags behind fast growth on narrow viewports and leaves a
  // 100–300 px gap). Only while the user has not scrolled away (gap < 120 px); a programmatic scroll never counts as a layout shift.
  useLayoutEffect(() => {
    const node = el.current; if (!node || !isRunning) return;
    const gap = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (atBottom.current && gap > 2) node.scrollTop = node.scrollHeight;
    else atBottom.current = gap < 120;
  }, [st.version, isRunning]);
  // The "Jump to latest" pill is PORTALLED into the scroll container (absolute, out of flow). Rendering it as a sibling of the thread made
  // OpenUI's flex row shrink the whole thread by 128 px on every toggle — the single biggest layout shift in the recordings (CLS 0.23–0.81).
  const host = typeof document !== "undefined" ? el.current?.parentElement ?? null : null;
  if (!away || !host || count === 0) return null;
  return createPortal(<button type="button" className="oiu-jump" data-testid="jump-to-latest" onClick={() => { const node = el.current; if (node) { node.scrollTo({ top: node.scrollHeight, behavior: "smooth" }); atBottom.current = true; setAway(false); } }}><ArrowDown className="size-3.5" aria-hidden /> Jump to latest</button>, host);
}

