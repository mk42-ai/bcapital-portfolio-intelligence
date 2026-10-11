"use client";
/**
 * §8 ChatComponent — one per message. Structure, class strings and derived flags follow the spec verbatim. Stubs (spec §11):
 * MessageActions (hover copy/regenerate/report), the clarification form, reply chunks, the status-log side panel button and the
 * debug-mode "Request For Increase" link render nothing. "Logs" downloads the execution log JSON; "Plan" opens the plan JSON in the
 * code-preview drawer (stand-in for the ExecutionPlanModal).
 */
import { Check, ChevronDown, Download, File } from "lucide-react";
import { memo, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import BrandLogo from "./brand-logo";
import { useCodePreview } from "./code-preview";
import FulfilmentThinking from "./fulfilment-thinking";
import Loader from "./loader";
import { MarkdownAnswer } from "./markdown";
import { formatTaskTime } from "./messages";
import StatusLogBlock, { hasVisibleStep } from "./status-log-block";
import SuggestedQueryPlugins from "./suggested-query-plugins";
import ThinkingProcess from "./thinking-process";
import type { BotMessageType, MessageType, UserMessageType } from "./types";

const StoppedPill = () => (
  <div className="flex w-fit items-center justify-center gap-2 rounded-md border border-border1 bg-card px-3 py-1.5 text-xs text-neutral-300">
    <Check className="size-3" />STOPPED
  </div>
);
const MovedToBackgroundPill = () => (
  <div className="flex w-fit items-center justify-center gap-2 rounded-md border border-border1 bg-card px-3 py-1.5 text-xs text-neutral-300">
    <Check className="size-3" />MOVED TO BACKGROUND
  </div>
);

/** Spec §11: MessageActions (copy / regenerate / report on hover) is out of scope — stub; flip HAS_MESSAGE_ACTIONS when it is ported. */
const HAS_MESSAGE_ACTIONS = false;
const MessageActions = (_: { message: MessageType }) => null;

type Props = {
  message: MessageType;
  index: number;
  lastIndex: number;
  isLoading: boolean;
  isLastMessage: boolean;
  setMessages: Dispatch<SetStateAction<MessageType[]>>;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  UserMessage?: UserMessageType;
  handleSubmit?: (query: string) => void;
};

const downloadJson = (name: string, data: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data ?? null, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function ChatComponent({ message, index, lastIndex, isLoading, isLastMessage, setMessages, chatContainerRef }: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activateShowMore, setActivateShowMore] = useState(false);
  const userMessageRef = useRef<HTMLDivElement>(null);
  const { open: openPreview } = useCodePreview();

  // ---- §8.1 derived flags (verbatim)
  const botMessage = message.author === "bot" ? message : null;
  const isStreamingMessage = isLoading && isLastMessage; // loaders only spin for the live message

  const hasThinkingContent =
    !!botMessage && (!!botMessage.thinking?.trim() || !!botMessage.planningAnswer?.trim());

  const isSuggestingPlugins =
    isLoading && isLastMessage &&
    botMessage?.statusLogs?.length === 1 &&
    botMessage.statusLogs[0]?.statusType === "plugin_suggestion.initialized";

  const hasSuggestedPlugins = botMessage?.statusLogs?.[1]?.statusType === "plugin_suggestion.completed";

  const hasStatusLogContent =
    !!botMessage &&
    (!!botMessage.statusLogs?.length || !!botMessage.planningAnswer?.trim() ||
     !!botMessage.pluginThinking?.trim() || !!botMessage.fulfillmentThinking?.trim());

  const shouldShowStatusLogs = !!botMessage && !!botMessage.isOpenLogs && hasStatusLogContent;

  const shouldShowInfoBlock = !!botMessage && (hasThinkingContent || shouldShowStatusLogs);

  const showFulfillmentThinking = !botMessage?.message && botMessage?.fulfillmentThinking?.trim();

  const showClarificationRequest =
    !!botMessage && !!botMessage.clarificationRequest?.queries?.length && isLastMessage;
  const clarificationStepId = botMessage?.clarificationRequest?.stepId;
  const showStepClarificationInLogs =
    showClarificationRequest && !!clarificationStepId && shouldShowStatusLogs &&
    hasVisibleStep(botMessage, clarificationStepId);

  const cancelledError = message.errorMessage?.includes("Client cancelled the request");
  const isMovedToBackground = !!botMessage?.isBackgroundProcessing && !botMessage?.message;

  const isShowLoader = () =>
    lastIndex === index &&
    (message.status === "loading" || (isLoading && message.payloadData?.responseMode === "stream"));

  const isShowButtons = () => (index === lastIndex ? !isLoading : true);

  // User "Show more": collapse long user bubbles at 500 px (bots: never).
  useLayoutEffect(() => {
    const el = userMessageRef.current;
    if (!el || message.author !== "user") { setActivateShowMore(false); return; }
    const update = () => setActivateShowMore(el.scrollHeight > 500);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [message.author, message.id, message.message, isExpanded]);

  if (!message.message && message.author === "user") return null;

  const isUser = message.author === "user";
  const rtl = !!message.rtl;
  /** Spec §11: the clarification form UI is out of scope — the data plumbing is complete, the form renders nothing. */
  const clarificationForm = null;
  const suggestedPlugins = botMessage?.statusLogs?.[1]?.suggestedPlugins ?? [];

  const toggleLogs = () =>
    setMessages((prev) => prev.map((m, i) => (i === index && m.author === "bot" ? { ...m, isOpenLogs: !m.isOpenLogs } : m)));

  const renderExecutionActions = () => {
    if (!botMessage || !isShowButtons() || message.payloadData?.fulfillmentOnly) return null;
    const plan = botMessage.statusLogs?.find((l) => l.queryPlan)?.queryPlan ?? botMessage.executionLog ?? null;
    return (
      <p className="mt-2 flex w-fit items-start gap-2">
        {message.id && botMessage.sessionId && message.id.toString().length > 15 && !message.file && (
          <button onClick={() => downloadJson(`execution-logs-${message.id}.json`, botMessage.executionLog ?? botMessage.statusLogs ?? null)} className="flex items-center justify-center gap-2 rounded-md border border-border1 bg-card px-3 py-1.5 text-neutral-300 hover:border-[#3bb795]/80 hover:bg-[#3bb79516] hover:text-primary-400">
            <Download className="size-3" /><span className="text-xs">Logs</span>
          </button>
        )}
        {!message.file && !message.videoUrl && (
          <button onClick={() => openPreview({ key: `plan:${message.id}`, language: "json", code: JSON.stringify(plan, null, 2) })} className="flex items-center justify-center gap-2 rounded-md border border-border1 bg-card px-3 py-1.5 text-neutral-300 hover:border-[#3bb795]/80 hover:bg-[#3bb79516] hover:text-primary-400">
            <File className="size-3" /><span className="text-xs">Plan</span>
          </button>
        )}
      </p>
    );
  };

  const metrics = botMessage?.metrics;

  return (
    <div
      data-message-id={message.id}
      className={`relative my-3 flex w-full flex-col items-start rounded-md border border-transparent p-2 transition duration-200 ease-in${rtl ? " self-end" : ""}${isUser ? " items-end self-end" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {botMessage && (
        <div className="sticky top-12 z-10 w-full">
          {!isLoading && isHovered && HAS_MESSAGE_ACTIONS && (
            <div className="absolute -top-5 right-0 rounded-md bg-bgColor px-2 py-2"><MessageActions message={message} /></div>
          )}
        </div>
      )}

      {/* ── HEADER ROW */}
      <div className="flex w-full gap-4">
        <div className={`flex gap-[0.5rem]${rtl ? " self-end" : ""}`}>
          {botMessage && rtl && <div className="font-bold">B Capital</div>}
          {botMessage && (
            <div className="flex h-[1.25rem] w-[1.25rem] flex-shrink-0 items-center justify-center [&_svg]:size-[18px] [&_svg]:opacity-80">
              {isShowLoader() ? <Loader /> : <BrandLogo />}
            </div>
          )}
          {botMessage && !rtl && <div className="font-bold">B Capital</div>}
        </div>
        <div className="flex items-center gap-2">
          {metrics && (
            <div className="flex items-center gap-2 font-medium text-primary-500 dark:text-primary-300">
              <Tooltip>
                <TooltipTrigger asChild><span>{formatTaskTime((metrics.ragTimeSec ?? 0) + (metrics.fulfillmentTimeSec ?? 0))}</span></TooltipTrigger>
                <TooltipContent>Task Time</TooltipContent>
              </Tooltip>
              <span className="text-neutral-400 dark:text-neutral-300">{metrics.totalTokens || 0} tokens</span>
            </div>
          )}
          {botMessage && !!botMessage.statusLogs?.length && (
            <button
              type="button"
              aria-expanded={botMessage.isOpenLogs}
              aria-label="Toggle status logs"
              className={`flex cursor-pointer items-center text-gray [&_svg]:size-4${botMessage.isOpenLogs ? " rotate-180" : ""}`}
              onClick={toggleLogs}
            >
              <ChevronDown />
            </button>
          )}
        </div>
      </div>

      {/* ── Suggested plugins */}
      {botMessage && <SuggestedQueryPlugins isSuggestingPlugins={!!isSuggestingPlugins} hasSuggestedPlugins={hasSuggestedPlugins} suggestedPlugins={suggestedPlugins} />}

      {/* ── INFO BLOCK */}
      {shouldShowInfoBlock && botMessage && (
        <>
          {hasThinkingContent && (
            <div className="ml-2 mt-1 w-full max-w-[840px]"><ThinkingProcess key={botMessage.id} message={botMessage} chatContainerRef={chatContainerRef} isStreaming={isStreamingMessage} /></div>
          )}
          {showClarificationRequest && !showStepClarificationInLogs && clarificationForm && (
            <div className="mb-2 mt-1 w-full max-w-[840px]">{clarificationForm}</div>
          )}
          {shouldShowStatusLogs && (
            <div className="ml-2 w-full max-w-[840px]">
              <StatusLogBlock
                key={botMessage.id}
                message={botMessage}
                isStreaming={isStreamingMessage}
                stepClarifications={showStepClarificationInLogs && clarificationStepId && clarificationForm ? { [clarificationStepId]: clarificationForm } : undefined}
              />
            </div>
          )}
          {showFulfillmentThinking && (
            <div className="mb-2 w-full max-w-[840px] pb-4"><FulfilmentThinking key={botMessage.id} message={botMessage} isStreaming={isStreamingMessage} /></div>
          )}
        </>
      )}

      {/* ── BODY ROW */}
      <div className={`flex w-full gap-4${isUser ? " flex-row-reverse" : ""}`}>
        <div className={`flex min-h-[3rem] min-w-0 max-w-[80%] flex-col gap-[0.25rem] text-sm lg:text-base${rtl ? " rtl pr-[30px]" : " pl-[30px]"}${botMessage ? " w-full max-w-[840px] pl-[10px]" : ""}`}>
          {botMessage && botMessage.isFetching && message.payloadData?.responseMode === "sync" ? (
            <div className="dark:dark flex w-full items-center gap-[0.5rem] leading-[187.5%]">
              <Loader className="my-0 w-min [&_svg]:h-[1.374rem] [&_svg]:w-[1.374rem]" />
              <span className="w-full">Interacting with AI to get your result...</span>
            </div>
          ) : (
            <div className={`relative${isUser ? " rounded-xl rounded-br border border-[#cfd6df] bg-[#f0f2f4] px-4 py-3 dark:border-border1 dark:bg-[#1B1A1A]" : ""}`}>
              <div
                ref={userMessageRef}
                className={`flex flex-col gap-[0.5rem] leading-[187.5%]${isUser ? " max-h-[500px] overflow-y-hidden" : ""}${isUser && isExpanded ? " max-h-none overflow-y-auto" : ""}`}
              >
                <span><MarkdownAnswer text={message.message} messageId={message.id} isStreaming={isStreamingMessage} /></span>
                {botMessage && botMessage.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={botMessage.thumbnail} alt="" className="h-24 w-40 rounded-md object-contain shadow-md transition-transform duration-200 hover:scale-[1.03]" />
                )}
                {message.errorMessage && (cancelledError ? <StoppedPill /> : (
                  <span className="text-red-300"><MarkdownAnswer text={message.errorMessage} /></span>
                ))}
                {isMovedToBackground && <MovedToBackgroundPill />}
                {cancelledError || isMovedToBackground ? null : renderExecutionActions()}
              </div>
              {isUser && activateShowMore && <div className="absolute bottom-[40px] left-0 h-[50px] w-full bg-gradient-to-b from-transparent to-[#f0f2f4] dark:to-[#1B1A1A]" />}
              {isUser && activateShowMore && (
                <div className="relative h-[40px] items-center justify-start">
                  <button
                    type="button"
                    onClick={() => setIsExpanded((v) => !v)}
                    className="absolute bottom-0 left-0 cursor-pointer rounded-sm border border-transparent bg-transparent !px-2 !py-1 !text-xs text-primary-400 hover:border-primary-400 hover:bg-primary-800"
                  >
                    {isExpanded ? "Show less" : "Show more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="sticky top-12 z-10 mt-2 self-start">{isHovered && isUser && HAS_MESSAGE_ACTIONS && <MessageActions message={message} />}</div>
      </div>
    </div>
  );
}

export default memo(ChatComponent);
export type { BotMessageType };
