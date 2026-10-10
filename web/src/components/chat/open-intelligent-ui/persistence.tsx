"use client";
/** Persistence (thread → messages/session) + AutoAsk (/chat?q=). */
import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useThread, useThreadList } from "@openuidev/react-ui";
import { saveMessages, rememberSession } from "./local-storage";
import { attachmentsStore } from "./attachments";
import { setCurrentThreadId } from "./stream-store";
export { Suspense };

/** Persists streamed messages + remembers the OnDemand sessionId per thread (from the x-ondemand-session header / ondemand.session frame). */
export function Persistence({ sessionRef }: { sessionRef: React.MutableRefObject<Record<string, string>> }) {
  const messages = useThread((s) => s.messages); const selected = useThreadList((s) => s.selectedThreadId);
  useEffect(() => { if (selected && messages.length) saveMessages(selected, messages); }, [messages, selected]);
  useEffect(() => { if (selected && sessionRef.current[selected]) rememberSession(selected, sessionRef.current[selected]); }, [selected, messages, sessionRef]);
  useEffect(() => { setCurrentThreadId(selected ?? null); if (selected) attachmentsStore.hydrate(selected); }, [selected]);
  return null;
}

/** Deep link: /chat?q=<question> sends the question once on load. */
export function AutoAsk() {
  const sp = useSearchParams(); const q = sp.get("q")?.trim() ?? "";
  const processMessage = useThread((s) => s.processMessage); const isRunning = useThread((s) => s.isRunning);
  const sent = useRef(false);
  useEffect(() => {
    if (!q || sent.current || isRunning) return; sent.current = true;
    const t = setTimeout(() => { void processMessage({ role: "user", content: q }); }, 400);
    return () => clearTimeout(t);
  }, [q, isRunning, processMessage]);
  return null;
}
