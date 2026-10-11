/**
 * Builds ONE bot message from raw OnDemand frames, outside React — used by /chat, which receives the raw frames as `ondemand.raw` CUSTOM
 * events from its bridge. Same event → field mapping as the §4 parsers in use-od-stream.ts and the same appendBotMessage reducer, so /chat
 * renders identical message data to /chat-od.
 */
import type { Dispatch, SetStateAction } from "react";
import { appendBotMessage, botStreamingCompleted, createBotMessage, isBotMessage } from "./messages";
import type { BotMessageType, ExecutePlugin, MessageType, SendMessagePayload, TParsedMessageData, TThinkingMessageData } from "./types";

export function createOdRun() {
  const payloadData = { responseMode: "stream" } as SendMessagePayload;
  let messages: MessageType[] = [createBotMessage({ isFetching: true, payload: payloadData })];
  const executedAgents: ExecutePlugin[] = [];
  let executionLog: unknown;
  const setMessages: Dispatch<SetStateAction<MessageType[]>> = (a) => { messages = typeof a === "function" ? a(messages) : a; };

  const thinking = (t: TThinkingMessageData) => {
    const base = { setMessages, id: t.messageId, sessionId: t.sessionId, executionLog, payloadData };
    if (t.eventType === "planning_thinking") appendBotMessage({ ...base, newThinking: t.thinking?.delta });
    else if (t.eventType === "planning_output") appendBotMessage({ ...base, newPlanningAnswer: t.output?.delta });
    else if (t.eventType === "step_thinking") appendBotMessage({ ...base, newPluginThinking: t.thinking?.delta, stepId: t.stepId });
    else if (t.eventType === "fulfillment_thinking") appendBotMessage({ ...base, newFulfillmentThinking: t.thinking?.delta });
    // step_output: intentionally ignored
  };

  const message = (data: string) => {
    if (data.startsWith("[DONE]")) { botStreamingCompleted(setMessages); return; }
    if (data.startsWith("[ERROR]")) return; // /chat reports errors through its own banner
    const p = JSON.parse(data) as TParsedMessageData;
    if (!p.eventType) return;
    const base = { setMessages, id: p.messageId, sessionId: p.sessionId, payloadData };
    if (p.currentStatusLog?.statusType === "execution_log_created") executionLog = p.currentStatusLog.executionLog;
    if (p.eventType === "fulfillment") appendBotMessage({ ...base, executionLog, newMessage: p.answer });
    if (p.eventType === "metricsLog") appendBotMessage({ ...base, executionLog, newMessage: p.answer, metrics: p.publicMetrics || null });
    if (p.eventType === "statusLog") {
      if (p.currentStatusLog?.executedAgents) executedAgents.push(...p.currentStatusLog.executedAgents);
      appendBotMessage({ ...base, executionLog, executedAgents, statusLog: p.currentStatusLog && { ...p.currentStatusLog, stepId: p.stepId, stepTitle: p.stepTitle } });
    }
    if (p.eventType === "plugin_sources" && p.sources?.items?.length) appendBotMessage({ ...base, executionLog, newSources: p.sources.items });
    if (p.eventType === "planning_answer") appendBotMessage({ ...base, executionLog, newPlanningAnswer: p.answer });
    if (p.eventType === "plugin_answer") appendBotMessage({ ...base, executionLog, newPluginAnswer: p.answer });
  };

  return {
    /** Apply one raw frame (`event` = SSE event name: "message" | "thinking" | …). Never throws. */
    apply(event: string, data: string) {
      try {
        if (event === "thinking") thinking(JSON.parse(data) as TThinkingMessageData);
        else if (event === "message" || event === "") message(data);
      } catch { /* a malformed frame never breaks the run */ }
    },
    complete() { botStreamingCompleted(setMessages); },
    get(): BotMessageType | null { const m = messages[messages.length - 1]; return m && isBotMessage(m) ? m : null; },
  };
}

/** Copy for localStorage: caps the long text fields so a settled turn stays inside the storage quota. */
export const compactOdMessage = (m: BotMessageType | null, cap = 40_000): BotMessageType | null => {
  if (!m) return null;
  const c = (s?: string) => (s && s.length > cap ? s.slice(-cap) : s);
  return {
    ...m, message: m.message.slice(0, 200), /* non-empty = answer started → steps render done */ payloadData: undefined, executionLog: undefined, executedAgents: undefined,
    thinking: c(m.thinking), planningAnswer: c(m.planningAnswer), pluginThinking: undefined, fulfillmentThinking: c(m.fulfillmentThinking),
    stepThinking: m.stepThinking && Object.fromEntries(Object.entries(m.stepThinking).map(([k, v]) => [k, c(v) ?? ""])),
    statusLogs: m.statusLogs?.map((l) => ({ ...l, executionLog: undefined, stepExecutionOutput: undefined, executionPlan: undefined })),
  };
};
