"use client";
/**
 * The hook that owns the OnDemand SSE connection — spec §1 (transport), §3.1 (submit), §4 (parsers, verbatim), §6 (batching) and §7
 * (heartbeat / retry / errors). Plumbing adapted to this app:
 *   - auth is the `apikey` header (Settings key, else NEXT_PUBLIC_ONDEMAND_API_KEY) straight to OnDemand; with no browser key the same POST
 *     goes to /api/od-chat/sessions/{id}/query, which relays OnDemand's SSE bytes unchanged with the server key;
 *   - the URL is /chat/v1/sessions/{id}/query (the apikey path; the spec's /client/ path is for bearer-token apps);
 *   - the token-refresh branch of handleError is dropped (apikey auth has no token to refresh);
 *   - the cancel API is not called on Stop (none is documented for apikey sessions).
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { SSE, type SSEvent } from "sse.js";
import { DEFAULT_EXTERNAL_USER_ID, ENDPOINT_ID, PLUGIN_IDS, PUBLIC_ONDEMAND_API_KEY, PUBLIC_ONDEMAND_BASE_URL, REASONING_MODE, RESPONSE_MODE, resolvePluginIds } from "@/lib/ondemand/config-public";
import { getSettings } from "@/lib/settings";
import {
  appendBotMessage, botStreamingCompleted, createBotMessage, createUserMessage, getExtension, getFileNameFromUrl, isBotMessage, replaceLastBotMessage,
} from "./messages";
import { toast } from "./toast";
import { useBatchedSetMessages } from "./use-batched-set-messages";
import type { ExecutePlugin, MessageType, SendMessagePayload, TParsedMessageData, TThinkingMessageData } from "./types";

const HEARTBEAT_CHECK_INTERVAL_MS = 12_000;
const HEARTBEAT_TIMEOUT_MS = 20_000;
const GENERIC_ERROR = "Failed to get the answer. Please try again";

/** Browser key → direct to OnDemand; none → this app's raw relay (server key). */
const browserKey = () => getSettings().apikey?.trim() || PUBLIC_ONDEMAND_API_KEY;

async function createSession(pluginIds: string[]): Promise<string> {
  const key = browserKey();
  const body = JSON.stringify({ externalUserId: getSettings().externalUserId || DEFAULT_EXTERNAL_USER_ID, pluginIds });
  const r = key
    ? await fetch(`${PUBLIC_ONDEMAND_BASE_URL}/chat/v1/sessions`, { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body })
    : await fetch("/api/od-chat/sessions", { method: "POST", headers: { "content-type": "application/json" }, body });
  const j = (await r.json().catch(() => ({}))) as { message?: string; sessionId?: string; data?: { id?: string } };
  const id = j.sessionId ?? j.data?.id;
  if (!r.ok || !id) throw new Error(j.message || GENERIC_ERROR);
  return id;
}

function queryTarget(sessionId: string): { url: string; headers: Record<string, string> } {
  const key = browserKey();
  return key
    ? { url: `${PUBLIC_ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query`, headers: { "Content-Type": "application/json", apikey: key } }
    : { url: `/api/od-chat/sessions/${sessionId}/query`, headers: { "Content-Type": "application/json" } };
}

export function useOdStream() {
  const [messages, rawSetMessages] = useState<MessageType[]>([]);
  const [isLoading, rawSetIsLoading] = useState(false);
  const [isInputDisabled, setIsInputDisabled] = useState(false);

  const sseClientRef = useRef<SSE | null>(null);
  const executionLogRef = useRef<unknown>(undefined);
  const idsRef = useRef<{ messageId: string; sessionId: string }>(undefined);
  const retryConnectionCount = useRef<number>(1);
  const retryPayloadRef = useRef<{ messageId: string; lastEventIndex: number }>({ messageId: "", lastEventIndex: 0 });
  const activeStreamSessionRef = useRef<string | null>(null); // set to the sessionId in connectSSE
  const lastHeartbeatTimeRef = useRef<number>(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatSessionRef = useRef<string | null>(null);
  const { bind: bindBatchedMessages, flush: flushStreamMessages, discard } = useBatchedSetMessages();

  const clearHeartbeatMonitor = useCallback(() => {
    if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
  }, []);

  // Close the stream when the page unmounts.
  useEffect(() => () => { clearHeartbeatMonitor(); sseClientRef.current?.close(); }, [clearHeartbeatMonitor]);

  const connectSSE = useCallback((payload: SendMessagePayload, sessionId: string) => {
    // Before opening a new connection: flush pending batched updates, clear heartbeat monitor, close any previous SSE instance.
    flushStreamMessages();
    clearHeartbeatMonitor();
    sseClientRef.current?.close();
    activeStreamSessionRef.current = sessionId;

    const setMessages = bindBatchedMessages(rawSetMessages);
    const setIsLoading: Dispatch<SetStateAction<boolean>> = (value) => {
      flushStreamMessages();   // never show isLoading=false with a half-streamed message
      rawSetIsLoading(value);
    };
    const executedAgents: ExecutePlugin[] = [];   // accumulates across statusLog events of one request

    // ---- §4.1 handleThinkingEvent (`thinking` channel) — verbatim
    function handleThinkingEvent(
      e: SSEvent,
      setMessages: Dispatch<SetStateAction<MessageType[]>>,
      payloadData: SendMessagePayload,
    ) {
      const thinkingParsedData: TThinkingMessageData = JSON.parse(e.data);

      retryConnectionCount.current = 1;
      retryPayloadRef.current = {
        messageId: thinkingParsedData?.messageId,
        lastEventIndex: thinkingParsedData?.eventIndex,
      };

      const base = {
        setMessages,
        newMessage: undefined,
        id: thinkingParsedData?.messageId,
        sessionId: thinkingParsedData?.sessionId,
        executionLog: executionLogRef.current,
        payloadData,
      };

      if (thinkingParsedData.eventType === "planning_thinking") {
        appendBotMessage({ ...base, newThinking: thinkingParsedData?.thinking?.delta });
      } else if (thinkingParsedData.eventType === "planning_output") {
        appendBotMessage({ ...base, newPlanningAnswer: thinkingParsedData?.output?.delta });
      } else if (thinkingParsedData.eventType === "step_thinking") {
        appendBotMessage({
          ...base,
          newPluginThinking: thinkingParsedData?.thinking?.delta,
          stepId: thinkingParsedData?.stepId,
        });
      } else if (thinkingParsedData.eventType === "step_output") {
        return; // intentionally ignored
      } else if (thinkingParsedData.eventType === "fulfillment_thinking") {
        appendBotMessage({ ...base, newFulfillmentThinking: thinkingParsedData?.thinking?.delta });
      }
    }

    // ---- §4.2 handleMessages (default `message` channel) — verbatim
    function handleMessages(
      e: SSEvent,
      setMessages: Dispatch<SetStateAction<MessageType[]>>,
      setIsInputDisabled: Dispatch<SetStateAction<boolean>>,
      setIsLoading: Dispatch<SetStateAction<boolean>>,
      payload: SendMessagePayload,
    ) {
      retryConnectionCount.current = 1;

      const data = e.data;
      if (!data) return;

      // ---- terminal: server error
      if (data.startsWith("[ERROR]")) {
        const jsonString = data.slice(8);
        const parsedError = JSON.parse(jsonString || "");
        appendBotMessage({
          setMessages,
          newMessage: undefined,
          id: idsRef.current?.messageId || "",
          sessionId: idsRef.current?.sessionId || "",
          executionLog: executionLogRef.current,
          errorMessage: parsedError.message || "Failed to get the answer. Please try again",
          payloadData: payload,
        });
        clearHeartbeatMonitor();
        sseClientRef.current?.close();
        setIsInputDisabled(false);
        setIsLoading(false);
        return;
      }

      // ---- terminal: done
      if (data?.startsWith("[DONE]")) {
        clearHeartbeatMonitor();
        botStreamingCompleted(setMessages);
        setIsInputDisabled(false);
        setIsLoading(false);
        executionLogRef.current = undefined;
        return;
      }

      const parsedData: TParsedMessageData = JSON.parse(data);

      // Ignore events from a connection that no longer matches the active session
      if (
        activeStreamSessionRef.current &&
        parsedData.sessionId &&
        parsedData.sessionId !== activeStreamSessionRef.current
      ) {
        return;
      }

      idsRef.current = { messageId: parsedData.messageId, sessionId: parsedData.sessionId };
      retryPayloadRef.current = { messageId: parsedData.messageId, lastEventIndex: parsedData.eventIndex };

      if (parsedData?.currentStatusLog?.statusType === "execution_log_created") {
        executionLogRef.current = parsedData.currentStatusLog?.executionLog;
      }

      // NOTE: independent ifs, not else-if
      if (parsedData.eventType === "fulfillment") {
        appendBotMessage({
          setMessages,
          newMessage: parsedData.answer,          // answer token delta
          id: parsedData?.messageId,
          sessionId: parsedData?.sessionId,
          executionLog: executionLogRef.current,
          payloadData: payload,
        });
      }

      if (parsedData.eventType === "metricsLog") {
        appendBotMessage({
          setMessages,
          newMessage: parsedData.answer,
          id: parsedData?.messageId,
          sessionId: parsedData?.sessionId,
          executionLog: executionLogRef.current,
          payloadData: payload,
          metrics: parsedData?.publicMetrics || null,
        });
      }

      if (parsedData.eventType === "statusLog") {
        if (parsedData.currentStatusLog?.executedAgents) {
          executedAgents.push(...parsedData.currentStatusLog.executedAgents);
        }

        // (Optional, host-app specific) plugin suggestions arrive here:
        // parsedData.currentStatusLog?.suggestedPlugins

        appendBotMessage({
          setMessages,
          newMessage: undefined,
          executedAgents: executedAgents,
          // stepId/stepTitle arrive at the event's top level; keep them on the log for grouping
          statusLog: parsedData.currentStatusLog && {
            ...parsedData.currentStatusLog,
            stepId: parsedData.stepId,
            stepTitle: parsedData.stepTitle,
          },
          id: parsedData?.messageId,
          sessionId: parsedData?.sessionId,
          executionLog: executionLogRef.current,
          payloadData: payload,
        });
        flushStreamMessages(); // status changes render immediately, not after 100ms
      }

      if (parsedData.eventType === "plugin_artifact_ready" && parsedData.artifact?.url) {
        const artifact = parsedData.artifact;
        const name = getFileNameFromUrl(artifact.url) || artifact.name || "artifact"; // URL is source of truth
        const fileId = artifact.artifactId || artifact.mediaId || artifact.url;
        appendBotMessage({
          setMessages,
          id: parsedData?.messageId,
          sessionId: parsedData?.sessionId,
          executionLog: executionLogRef.current,
          payloadData: payload,
          newOutputFile: {
            id: fileId,
            path: name,
            name,
            url: artifact.url,
            extension: artifact.extension || getExtension(name),
            sizeBytes: artifact.sizeBytes ?? 0,
            status: parsedData.status,
            addedAt: Date.now(),
            messageId: parsedData?.messageId,
          },
        });
      }

      if (parsedData.eventType === "plugin_sources" && parsedData.sources?.items?.length) {
        appendBotMessage({
          setMessages,
          id: parsedData?.messageId,
          sessionId: parsedData?.sessionId,
          executionLog: executionLogRef.current,
          payloadData: payload,
          newSources: parsedData.sources.items,
        });
      }

      if (parsedData.eventType === "clarification_request") {
        appendBotMessage({
          setMessages,
          newMessage: undefined,
          id: parsedData?.messageId,
          sessionId: parsedData?.sessionId,
          executionLog: executionLogRef.current,
          payloadData: payload,
          clarificationRequest: parsedData?.clarificationRequest && {
            ...parsedData.clarificationRequest,
            clarificationId: parsedData.clarificationId,
            title: parsedData.title,
            stepId: parsedData.stepId,
            stepTitle: parsedData.stepTitle,
          },
        });
      }

      if (parsedData.eventType === "planning_answer") {
        appendBotMessage({
          setMessages, newMessage: undefined,
          id: parsedData?.messageId, sessionId: parsedData?.sessionId,
          executionLog: executionLogRef.current, payloadData: payload,
          newPlanningAnswer: parsedData.answer,
        });
      }

      if (parsedData.eventType === "plugin_answer") {
        appendBotMessage({
          setMessages, newMessage: undefined,
          id: parsedData?.messageId, sessionId: parsedData?.sessionId,
          executionLog: executionLogRef.current, payloadData: payload,
          newPluginAnswer: parsedData.answer,
        });
      }
    }

    // ---- §7 handleError
    function handleError(e: { data?: string }) {
      // 1. No e.data (network drop / stale heartbeat): resume after the last event index, max 5 tries, 3 s apart after the first.
      if (!e?.data) {
        if (retryConnectionCount.current <= 5 && retryPayloadRef.current.messageId) {
          sseClientRef.current?.close();
          const delay = retryConnectionCount.current > 1 ? 3000 : 0;
          retryConnectionCount.current += 1;
          const resume = { ...payload, messageId: retryPayloadRef.current.messageId, lastEventIndex: retryPayloadRef.current.lastEventIndex } as SendMessagePayload;
          setTimeout(() => connectSSE(resume, sessionId), delay);
          return;
        }
        retryConnectionCount.current = 1;
        retryPayloadRef.current = { messageId: "", lastEventIndex: 0 };
        toast.error(GENERIC_ERROR);
        replaceLastBotMessage({ setMessages, message: GENERIC_ERROR, status: "error", payload });
        clearHeartbeatMonitor();
        setIsInputDisabled(false);
        setIsLoading(false);
        sseClientRef.current?.close();
        return;
      }
      // 2. With e.data (JSON). The token-refresh branch is dropped: this app authenticates with an apikey.
      let parsed: { error?: { message?: string }; errorCode?: string; message?: string } = {};
      try { parsed = JSON.parse(e.data); } catch { parsed = { message: e.data.slice(0, 300) }; }
      if (parsed.error) {
        toast.error(parsed.error.message || GENERIC_ERROR);
        setMessages((prev) => prev.slice(0, -1));
      } else if (parsed.errorCode && parsed.message) {
        replaceLastBotMessage({ setMessages, message: parsed.errorCode === "server_error" ? GENERIC_ERROR : parsed.message, status: "error", payload });
      } else {
        replaceLastBotMessage({ setMessages, message: parsed.message || GENERIC_ERROR, status: "error", payload });
      }
      clearHeartbeatMonitor();
      setIsInputDisabled(false);
      setIsLoading(false);
    }

    const { url, headers } = queryTarget(sessionId);
    const sse = new SSE(url, { headers, payload: JSON.stringify(payload), start: false });
    sseClientRef.current = sse;
    sse.onopen = () => {
      lastHeartbeatTimeRef.current = Date.now();
      clearHeartbeatMonitor();
      heartbeatTimerRef.current = setInterval(() => {
        if (Date.now() - lastHeartbeatTimeRef.current > HEARTBEAT_TIMEOUT_MS) {
          clearHeartbeatMonitor();
          handleError({ data: undefined });
        }
      }, HEARTBEAT_CHECK_INTERVAL_MS);
    };
    sse.onmessage = (e) => handleMessages(e, setMessages, setIsInputDisabled, setIsLoading, payload);
    sse.addEventListener("thinking", (e: SSEvent) => handleThinkingEvent(e, setMessages, payload));
    sse.addEventListener("heartbeat", () => {
      lastHeartbeatTimeRef.current = Date.now();
      retryConnectionCount.current = 1;
    });
    // `agent` channel (OnDemand coding agent) is out of scope (spec §11).
    sse.onerror = (e) => handleError(e);
    sse.onabort = () => clearHeartbeatMonitor();
    sse.stream();
  }, [bindBatchedMessages, clearHeartbeatMonitor, flushStreamMessages]);

  /** §3.1 — push the user message + placeholder bot message, set loading, then open the SSE. */
  const handleSubmit = useCallback(async (query: string, opts: { regenerate?: { messageId: string } } = {}) => {
    const text = query.trim();
    if (!text || isInputDisabled) return;
    const settings = getSettings();
    const requested = Object.entries(settings.plugins ?? {}).filter(([, on]) => on).map(([id]) => id);
    const { pluginIds } = resolvePluginIds(requested.length ? requested : PLUGIN_IDS, text);
    const body = {
      endpointId: ENDPOINT_ID,
      query: text,
      pluginIds,
      reasoningMode: REASONING_MODE,
      responseMode: RESPONSE_MODE,
      debugMode: "on",
      ...(opts.regenerate ? { regenerate: opts.regenerate } : {}),
    } as SendMessagePayload; // modelConfigs omitted on purpose: the account's defaults apply (same request the /chat page sends)
    const regenerate = opts.regenerate;
    const referenceChunks = undefined;

    rawSetMessages((prev) =>
      regenerate
        ? [...prev, createBotMessage({ isFetching: true, payload: body })]
        : [
            ...prev,
            createUserMessage({ message: query, payload: body, referenceChunks }),
            createBotMessage({ isFetching: true, payload: body }),
          ],
    );
    rawSetIsLoading(true);
    setIsInputDisabled(true);
    retryConnectionCount.current = 1;
    retryPayloadRef.current = { messageId: "", lastEventIndex: 0 };

    try {
      if (!chatSessionRef.current) chatSessionRef.current = await createSession(pluginIds);
    } catch (err) {
      const message = (err as Error).message || GENERIC_ERROR;
      toast.error(message);
      replaceLastBotMessage({ setMessages: rawSetMessages, message, status: "error", payload: body });
      rawSetIsLoading(false);
      setIsInputDisabled(false);
      return;
    }
    connectSSE(body, chatSessionRef.current);
  }, [connectSSE, isInputDisabled]);

  /** §6 Stop: discard, clear heartbeat, close, re-enable input, stop loading. The cancel API call is not available for apikey sessions,
   *  so the message is marked with the server's cancel text locally — that is what drives the STOPPED pill (§8.2). */
  const stop = useCallback(() => {
    discard();
    clearHeartbeatMonitor();
    sseClientRef.current?.close();
    setIsInputDisabled(false);
    rawSetIsLoading(false);
    rawSetMessages((prev) => prev.map((m, i) => (i === prev.length - 1 && isBotMessage(m) ? { ...m, status: "complete", isFetching: false, errorMessage: "Client cancelled the request" } : m)));
  }, [clearHeartbeatMonitor, discard]);

  const newChat = useCallback(() => {
    stop();
    chatSessionRef.current = null;
    rawSetMessages([]);
  }, [stop]);

  return { messages, setMessages: rawSetMessages, isLoading, isInputDisabled, handleSubmit, stop, newChat };
}
