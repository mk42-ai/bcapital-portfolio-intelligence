/** Ported verbatim from the OnDemand streaming-chat spec §3.1, §4 helpers and §5 (only types/import paths adapted). */
import type { Dispatch, SetStateAction } from "react";
import type {
  BotMessageStatus, BotMessageType, ClarificationRequest, CreateBotMessageParams, ExecutePlugin, MessageType, OutputFile,
  SendMessagePayload, Source, StatusLogType, TMetrics, UserMessageType,
} from "./types";

export const createUserMessage = ({ message, payload, referenceChunks }: {
  message: string; payload?: SendMessagePayload; referenceChunks?: Record<string, string>;
}): UserMessageType => ({
  id: Date.now().toString(),
  message,
  payloadData: payload,
  author: "user",
  referenceChunks,
});

export const createBotMessage = ({
  message = "", id, sessionId, isFetching = false, status = "loading",
  executedAgents, executionLog, payload, metrics = null, file, thumbnail, videoUrl, traceId,
}: CreateBotMessageParams): BotMessageType => ({
  id: id || Date.now().toString(),
  sessionId: sessionId || Date.now().toString(),
  message: status === "error" ? "" : message,
  errorMessage: status === "error" ? message : undefined,
  author: "bot",
  isFetching,
  status,
  executedAgents,
  executionLog,
  payloadData: payload,
  isOpenLogs: true,          // status logs are expanded by default
  metrics,
  ...(file ? { file } : {}),
  ...(thumbnail ? { thumbnail } : {}),
  ...(videoUrl ? { videoUrl } : {}),
  ...(traceId ? { traceId } : {}),
});

export const getExtension = (urlOrName: string): string => {
  const clean = urlOrName.split("?")[0].split("#")[0];
  const idx = clean.lastIndexOf(".");
  if (idx === -1) return "";
  return clean.slice(idx + 1).toLowerCase();
};

export const getFileNameFromUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url, "http://localhost");
    const queryFileName =
      parsedUrl.searchParams.get("filename") ||
      parsedUrl.searchParams.get("fileName") ||
      parsedUrl.searchParams.get("name");
    if (queryFileName) return queryFileName;

    const cleanRaw = url.split("?")[0].split("#")[0];
    let clean = cleanRaw;
    try { clean = decodeURIComponent(cleanRaw); } catch { clean = cleanRaw; }
    const segments = clean.split("/");
    return segments[segments.length - 1] || clean;
  } catch {
    return url;
  }
};

export const formatTaskTime = (seconds: number): string => {
  const totalSec = Math.round(seconds);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export type AppendBotMessageType = {
  setMessages: Dispatch<SetStateAction<MessageType[]>>;
  statusLog?: StatusLogType;
  newMessage?: string;
  executedAgents?: ExecutePlugin[];
  id: string;
  sessionId: string;
  errorMessage?: string;
  executionLog?: unknown;
  payloadData: SendMessagePayload;
  metrics?: TMetrics | null;
  newThinking?: string;
  newPluginThinking?: string;
  stepId?: string;
  newPlanningAnswer?: string;
  newPluginAnswer?: string;
  newFulfillmentThinking?: string;
  clarificationRequest?: ClarificationRequest;
  newOutputFile?: OutputFile;
  newSources?: Source[];
};

export const isBotMessage = (m: MessageType): m is BotMessageType => m?.author === "bot";

const isSameClarification = (a: ClarificationRequest | undefined, b: ClarificationRequest) =>
  !!a && a.clarificationId === b.clarificationId;

/**
 * Makes `incoming` the current question set. A replaced step set moves to
 * `previousClarifications` so earlier rounds stay visible under the step; plan
 * clarification happens once, so it isn't kept. Keyed by clarificationId, so a
 * replayed stream updates rounds in place instead of duplicating them, and keeps known answers.
 */
export const mergeClarificationRequest = (
  message: BotMessageType,
  incoming: ClarificationRequest | undefined,
): Pick<BotMessageType, "clarificationRequest" | "previousClarifications"> => {
  const current = message.clarificationRequest;
  if (!incoming) {
    return { clarificationRequest: current, previousClarifications: message.previousClarifications };
  }

  let previousClarifications = message.previousClarifications ?? [];
  if (current?.stepId && !isSameClarification(current, incoming)) {
    previousClarifications = previousClarifications.some((r) => isSameClarification(r, current))
      ? previousClarifications.map((r) => (isSameClarification(r, current) ? current : r))
      : [...previousClarifications, current];
  }

  const known = isSameClarification(current, incoming)
    ? current
    : previousClarifications.find((r) => isSameClarification(r, incoming));

  return {
    clarificationRequest: {
      ...incoming,
      queries: incoming.queries.map((query) => ({
        ...query,
        answer: query.answer ?? known?.queries.find((p) => p.query === query.query)?.answer,
      })),
    },
    previousClarifications,
  };
};

const upsertOutputFile = (existing: OutputFile[] | undefined, next: OutputFile): OutputFile[] => {
  const list = existing ?? [];
  const index = list.findIndex((f) => f.id === next.id);
  if (index === -1) return [...list, next];
  const merged = [...list];
  merged[index] = next;
  return merged;
};

const mergeSources = (existing: Source[] | undefined, next: Source[]): Source[] => {
  const list = existing ?? [];
  const seen = new Set(list.map((s) => s.url));
  const fresh = next.filter((s) => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  return fresh.length ? [...list, ...fresh] : list;
};

export const appendBotMessage = ({
  setMessages, statusLog, newMessage, executedAgents, id, sessionId, executionLog,
  errorMessage, payloadData, metrics = null, newThinking, newPluginThinking, stepId,
  newPlanningAnswer, newPluginAnswer, newFulfillmentThinking, clarificationRequest,
  newOutputFile, newSources,
}: AppendBotMessageType) => {
  setMessages((prev) => {
    const lastMessage = prev?.[prev.length - 1];
    const isLastBotMessage = lastMessage && isBotMessage(lastMessage);

    // Last message is a bot message → update it
    if (isLastBotMessage) {
      const message = lastMessage;
      const nextMessages = [...prev];
      let statusLogs = message?.statusLogs ? [...message.statusLogs] : [];
      if (statusLog?.statusType === "summarize_history.completed") {
        statusLogs = (message.statusLogs || []).filter(
          (l) => l.statusType !== "summarize_history.initialized",
        );
      } else if (statusLog) {
        statusLogs.push(statusLog);
      }
      const arabicChars = /[؀-ۿ]/;
      const nextText = `${message.message}${newMessage || ""}`;
      nextMessages[prev.length - 1] = {
        ...message,
        message: nextText,
        id,
        sessionId,
        isFetching: false,
        status: "streaming",
        executedAgents: executedAgents?.length ? executedAgents : message.executedAgents,
        statusLogs,
        errorMessage: errorMessage ?? message.errorMessage,
        rtl: newMessage ? arabicChars.test(nextText) : (message.rtl ?? arabicChars.test(nextText)),
        executionLog: executionLog ?? message.executionLog,
        payloadData: payloadData ?? message.payloadData,
        metrics: metrics ? metrics : message.metrics,
        thinking: `${message.thinking || ""}${newThinking || ""}`,
        pluginThinking: `${message.pluginThinking || ""}${newPluginThinking || ""}`,
        stepThinking:
          stepId && newPluginThinking
            ? { ...message.stepThinking, [stepId]: `${message.stepThinking?.[stepId] || ""}${newPluginThinking}` }
            : message.stepThinking,
        planningAnswer: `${message.planningAnswer || ""}${newPlanningAnswer || ""}`,
        pluginAnswer: `${message.pluginAnswer || ""}${newPluginAnswer || ""}`,
        fulfillmentThinking: `${message.fulfillmentThinking || ""}${newFulfillmentThinking || ""}`,
        ...mergeClarificationRequest(message, clarificationRequest),
        outputFiles: newOutputFile ? upsertOutputFile(message.outputFiles, newOutputFile) : message.outputFiles,
        sources: newSources?.length ? mergeSources(message.sources, newSources) : message.sources,
      };
      return nextMessages;
    }

    // No bot message at the end but we have ids → create one
    if (id && sessionId) {
      const arabicChars = /[؀-ۿ]/;
      const newBotMessage = createBotMessage({
        message: newMessage || "", id, sessionId, isFetching: false, status: "streaming",
        executedAgents, executionLog, payload: payloadData, metrics,
      });
      return [
        ...prev,
        {
          ...newBotMessage,
          statusLogs: statusLog ? [statusLog] : [],
          errorMessage,
          rtl: arabicChars.test(newBotMessage.message),
          thinking: newThinking || "",
          pluginThinking: newPluginThinking || "",
          ...(stepId && newPluginThinking ? { stepThinking: { [stepId]: newPluginThinking } } : {}),
          planningAnswer: newPlanningAnswer || "",
          pluginAnswer: newPluginAnswer || "",
          fulfillmentThinking: newFulfillmentThinking || "",
          ...(newOutputFile ? { outputFiles: [newOutputFile] } : {}),
          ...(newSources?.length ? { sources: mergeSources(undefined, newSources) } : {}),
        },
      ];
    }

    return prev;
  });
};

export const botStreamingCompleted = (setMessages: Dispatch<SetStateAction<MessageType[]>>) => {
  setMessages((prev) =>
    prev.map((message, index) =>
      isBotMessage(message) && index === prev.length - 1
        ? { ...message, status: "complete", isFetching: false }
        : message,
    ),
  );
};

/** Rebuilds the last bot message from scratch (used for transport errors). Keeps traceId. */
export const replaceLastBotMessage = ({ setMessages, status, id, sessionId, executionLog, executedAgents, message, file, payload, metrics = null, thumbnail, videoUrl, traceId }: {
  setMessages: Dispatch<SetStateAction<MessageType[]>>; status: BotMessageStatus; message: string;
} & Omit<CreateBotMessageParams, "status" | "message">) => {
  setMessages((prev) => {
    const replaced = prev[prev.length - 1];
    const previousTraceId = replaced && isBotMessage(replaced) ? replaced.traceId : undefined;
    return [
      ...prev.slice(0, -1),
      createBotMessage({
        message, id, sessionId, isFetching: false, status, executedAgents, executionLog,
        payload, metrics, file, thumbnail, videoUrl, traceId: traceId ?? previousTraceId,
      }),
    ];
  });
};
