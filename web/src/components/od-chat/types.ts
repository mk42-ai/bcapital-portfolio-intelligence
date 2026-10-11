/** Ported verbatim from the OnDemand streaming-chat spec §2 (only import paths adapted). */
export type BotMessageStatus = "streaming" | "complete" | "error" | "loading";

export type TMetrics = {
  fulfillmentTimeSec: number;
  inputTokens: number;
  outputTokens: number;
  ragTimeSec: number;
  totalTimeSec: number;
  totalTokens: number;
};

export type OutputFile = {
  id: string; path: string; name: string; url: string; extension: string;
  sizeBytes: number; status: string; addedAt: number; group?: string; messageId?: string;
};

export type Source = { title: string; url: string; domain: string; imageUrl?: string };

export type ClarificationRequestQuery = { query: string; options: string[]; answer?: string };

export type ClarificationRequest = {
  /** Identifies this question set; each new round gets a new id. */
  clarificationId?: string;
  title?: string;
  /** Present only when a plan step (not planning) is asking. */
  stepId?: string;
  stepTitle?: string;
  queries: ClarificationRequestQuery[];
};

export type TStatusLogsStatusType =
  | "analyzing" | "plan_created" | "agents_retrieved" | "executing"
  | "execution_completed" | "execution_log_created" | "fulfilling"
  | "agent.before_init" | "fulfillment_completed"
  | "summarize_history.initialized" | "summarize_history.completed"
  | "plugin_suggestion.initialized" | "plugin_suggestion.completed"
  | "initializing";

export type SuggestedPluginSummary = { id: string; pluginId: string; name: string; logoUrl: string };

// RetrievedPlugin / ExecutePlugin: only these fields are used by the UI
export type PluginRef = {
  agentId: string;
  pluginId: string;
  name: string;
  statusCode: number; // >= 400 means failed (red dot)
  [k: string]: unknown;
};
export type RetrievedPlugin = PluginRef;
export type ExecutePlugin = PluginRef;

export type QueryPlanType = { title?: string; objective: string; steps: { title?: string; query: string; depends: number[]; agents: { agentId: string; operationId: string }[] }[] };

export type StatusLogType = {
  /** Plan step this log belongs to; logs sharing it are grouped into one step */
  stepId?: string;
  stepTitle?: string;
  title?: string;
  stepQuery?: string;
  statusType: TStatusLogsStatusType;
  statusMessage: string;
  retrievedAgents: RetrievedPlugin[];
  executedAgents: ExecutePlugin[];
  executionLog?: unknown;
  time?: Date;
  queryPlan?: QueryPlanType;
  stepExecutionOutput?: unknown;
  executionPlan?: unknown;
  clarificationRequest?: ClarificationRequest;
  suggestedPlugins?: SuggestedPluginSummary[];
};

export type SendMessagePayload = {
  endpointId: string;
  query: string;
  pluginIds: string[];
  skillNames?: string[];
  reasoningMode?: string;
  reasoningEffort?: string;
  chatMode?: string;
  responseMode: "stream" | "sync" | "webhook";
  debugMode?: "on" | "off";
  modelConfigs: {
    fulfillmentPrompt: string; stopTokens: string[]; maxTokens: number;
    temperature: number; presencePenalty: number; frequencyPenalty: number; topP: number;
  };
  enablePluginSuggestions?: boolean;
  fulfillmentOnly?: boolean;
  regenerate?: { messageId: string };
  referenceChunks?: string[];
  useMemory?: boolean;
  clarificationRequest?: ClarificationRequestQuery[];
  serviceTier?: string;
};

export type BotMessageType = {
  id: string;
  sessionId: string;
  message: string;
  file?: { name: string; type: string; url: string; remoteUrl?: string; searchLevel?: string; id?: string } | null;
  author: "bot";
  errorMessage?: string;
  isFetching: boolean;
  status: BotMessageStatus;
  executedAgents?: ExecutePlugin[];
  statusLogs?: StatusLogType[];
  rtl?: boolean;
  executionLog?: unknown;
  payloadData?: SendMessagePayload;
  metrics: TMetrics | null;
  isOpenLogs: boolean;
  thumbnail?: string;
  videoUrl?: string;
  thinking?: string;
  pluginThinking?: string;
  /** step_thinking text keyed by stepId, matching the stepId on status logs */
  stepThinking?: Record<string, string>;
  planningAnswer?: string;
  pluginAnswer?: string;
  agentData?: unknown[];
  fulfillmentThinking?: string;
  clarificationRequest?: ClarificationRequest;
  /** Step question sets replaced by a newer clarificationRequest, oldest first. */
  previousClarifications?: ClarificationRequest[];
  todo?: unknown;
  terminalLogs?: unknown[];
  outputFiles?: OutputFile[];
  sources?: Source[];
  isBackgroundProcessing?: boolean;
  traceId?: string;
};

export type UserMessageType = {
  id: string;
  message: string;
  file?: BotMessageType["file"];
  errorMessage?: string;
  author: "user";
  rtl?: boolean;
  isFetching?: boolean;
  status?: BotMessageStatus;
  payloadData?: SendMessagePayload;
  metrics?: TMetrics | null;
  statusLogs?: unknown[];
  thumbnail?: string;
  videoUrl?: string;
  referenceChunks?: Record<string, string>;
};

export type MessageType = BotMessageType | UserMessageType;

/** Payload of the default `message` channel */
export type TParsedMessageData = {
  sessionId: string;
  messageId: string;
  eventIndex: number;
  eventType: string;
  stepId?: string;
  stepTitle?: string;
  status: string;
  currentStatusLog?: StatusLogType;
  answer?: string;
  publicMetrics?: TMetrics;
  clarificationId?: string;
  title?: string;
  clarificationRequest?: ClarificationRequest;
  artifact?: {
    artifactId?: string; mediaId?: string; name?: string; url: string; artifactType?: string;
    extension?: string; sizeBytes?: number; status?: string;
  };
  sources?: { agentId?: string; pluginId?: string; pluginName?: string; operationId?: string; items?: Source[] };
};

/** Payload of the `thinking` channel */
export type TThinkingMessageData = {
  stepId?: string;
  thinking?: { delta: string };
  output?: { delta: string };
  event: string;
  status: string;
  eventIndex: number;
  eventType: string;
  messageId: string;
  sessionId: string;
};

/** Params of createBotMessage (§3.1) — the spec names the type without listing it; fields are exactly the destructured ones. */
export type CreateBotMessageParams = {
  message?: string;
  id?: string;
  sessionId?: string;
  isFetching?: boolean;
  status?: BotMessageStatus;
  executedAgents?: ExecutePlugin[];
  executionLog?: unknown;
  payload?: SendMessagePayload;
  metrics?: TMetrics | null;
  file?: BotMessageType["file"];
  thumbnail?: string;
  videoUrl?: string;
  traceId?: string;
};
