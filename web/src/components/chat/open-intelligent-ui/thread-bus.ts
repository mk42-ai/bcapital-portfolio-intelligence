"use client";
/**
 * Thread bus: publishes OpenUI's thread list/selection (which lives inside <AgentInterface>'s ChatProvider) to components OUTSIDE it —
 * the nav rail's nested thread list (Agent 21) and the 52 px top bar's thread title (Agent 20). <ThreadBusBridge/> is mounted inside the
 * AgentInterface tree by the chat shell. Off /chat the rail falls back to the localStorage thread list and navigates to /chat?thread=<id>.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useThread, useThreadList } from "@openuidev/react-ui";
export type BusThread = { id: string; title: string; createdAt?: string };
export type ThreadBus = { mounted: boolean; threads: BusThread[]; selectedId: string | null; isRunning: boolean; select: (id: string) => void; newChat: () => void };
const noop = () => {};
const EMPTY: ThreadBus = { mounted: false, threads: [], selectedId: null, isRunning: false, select: noop, newChat: noop };
let bus: ThreadBus = EMPTY;
const listeners = new Set<() => void>();
const publish = (next: ThreadBus) => { bus = next; listeners.forEach((l) => l()); };
export const useThreadBus = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => bus, () => EMPTY);
export const getThreadBus = () => bus;
/** Reads the persisted thread list without a ChatProvider (nav rail on non-chat routes). */
export function readStoredThreads(): BusThread[] { try { const v = localStorage.getItem("bcap.chat.threads.v2"); return v ? (JSON.parse(v) as BusThread[]) : []; } catch { return []; } }
export function ThreadBusBridge() {
  const threads = useThreadList((s) => s.threads); const selectedId = useThreadList((s) => s.selectedThreadId);
  const select = useThreadList((s) => s.selectThread); const newChat = useThreadList((s) => s.switchToNewThread);
  const loadThreads = useThreadList((s) => s.loadThreads); const loading = useThreadList((s) => s.isLoadingThreads);
  const isRunning = useThread((s) => s.isRunning);
  // OpenUI only lists threads inside its own (now deleted) sidebar: load them here once so the nav rail / top bar / ?thread= deep link work.
  useEffect(() => { if (!threads.length && !loading) loadThreads(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { publish({ mounted: true, threads: threads.filter((t) => !t.isPending).map((t) => ({ id: t.id, title: t.title || "New conversation", createdAt: String(t.createdAt ?? "") })), selectedId, isRunning, select, newChat }); }, [threads, selectedId, isRunning, select, newChat]);
  useEffect(() => () => publish(EMPTY), []);
  // Deep link /chat?thread=<id> (from the nav rail on another route).
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("thread"); if (!id) return;
    if (threads.some((t) => t.id === id) && selectedId !== id) { select(id); history.replaceState(null, "", location.pathname); }
  }, [threads, selectedId, select]);
  return null;
}
