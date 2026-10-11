/** Ported verbatim from the OnDemand streaming-chat spec §6 — stream updates are batched every 100 ms. */
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { MessageType } from "./types";

type SetMessages = Dispatch<SetStateAction<MessageType[]>>;
type MessagesUpdater = (prev: MessageType[]) => MessageType[];
const FLUSH_INTERVAL_MS = 100;

export const useBatchedSetMessages = () => {
  const queueRef = useRef<MessagesUpdater[]>([]);
  const targetRef = useRef<SetMessages | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const queue = queueRef.current;
    if (!queue.length || !targetRef.current) return;
    queueRef.current = [];
    targetRef.current((prev) => queue.reduce((acc, updater) => updater(acc), prev));
  }, []);

  const batchedSetMessages: SetMessages = useCallback((action) => {
    if (typeof action !== "function") { flush(); targetRef.current?.(action); return; }
    queueRef.current.push(action);
    if (!timerRef.current) timerRef.current = setTimeout(flush, FLUSH_INTERVAL_MS);
  }, [flush]);

  const bind = useCallback((setMessages: SetMessages) => {
    if (setMessages === batchedSetMessages) return batchedSetMessages;
    if (targetRef.current !== setMessages) { flush(); targetRef.current = setMessages; }
    return batchedSetMessages;
  }, [batchedSetMessages, flush]);

  const discard = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    queueRef.current = [];
  }, []);

  useEffect(() => discard, [discard]);
  return { bind, flush, discard };
};
