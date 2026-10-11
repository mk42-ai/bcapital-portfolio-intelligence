"use client";
/** §8.5 StatusLogBlock + groupStatusLogs and §8.6 StepStatusLog — verbatim. */
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import ComponentShadow from "./component-shadow";
import { Markdown } from "./markdown";
import { DEFAULT_PLUGIN_LOGO_URL, usePluginLogo } from "./plugin-logo";
import StatusAccordion, { oneLineTail } from "./status-accordion";
import type { BotMessageType, PluginRef, StatusLogType, TStatusLogsStatusType } from "./types";

export type StepPlugin = { key: string; agentId: string; name: string; count: number; failed: boolean };
export type StepGroup = { stepId: string; title: string; statusType: TStatusLogsStatusType; agents: PluginRef[]; plugins: StepPlugin[] };
export type StatusLogItem = { kind: "log"; statusLog: StatusLogType; index: number } | { kind: "step"; group: StepGroup };

// "agent-123" and "plugin-123" refer to the same plugin, so compare the part after the "-"
const getPluginKey = (p: PluginRef) => (p.pluginId || p.agentId || p.name).split("-").pop() ?? "";

const groupPlugins = (agents: PluginRef[]) => {
  const byKey = new Map<string, StepPlugin>();
  agents.forEach((agent) => {
    const key = getPluginKey(agent);
    const failed = agent.statusCode >= 400;
    const existing = byKey.get(key);
    if (existing) { existing.count += 1; existing.failed ||= failed; }
    else byKey.set(key, { key, agentId: agent.agentId, name: agent.name, count: 1, failed });
  });
  return [...byKey.values()];
};

/** Folds per-step events sharing a stepId into one group at the position of the step's first log. */
export const groupStatusLogs = (statusLogs: StatusLogType[]) => {
  const items: StatusLogItem[] = [];
  const groups = new Map<string, StepGroup>();
  statusLogs.forEach((statusLog, index) => {
    const { stepId } = statusLog;
    if (!stepId) { items.push({ kind: "log", statusLog, index }); return; }
    let group = groups.get(stepId);
    if (!group) {
      group = {
        stepId,
        // first title wins; never the generic statusMessage ("Analyzing the prompt…", "Executing the agents…")
        title: statusLog.stepTitle || statusLog.title || "",
        statusType: statusLog.statusType,
        agents: [],
        plugins: [],
      };
      groups.set(stepId, group);
      items.push({ kind: "step", group });
    }
    if (!group.title) group.title = statusLog.stepTitle || statusLog.title || "";
    group.statusType = statusLog.statusType;
    const latestAgents = statusLog.executedAgents?.length ? statusLog.executedAgents : statusLog.retrievedAgents;
    if (latestAgents?.length) { group.agents = latestAgents; group.plugins = groupPlugins(latestAgents); }
  });
  return items;
};

export const hasVisibleStep = (message: BotMessageType, stepId: string) =>
  groupStatusLogs(message.statusLogs ?? []).some((i) => i.kind === "step" && i.group.stepId === stepId);

const STATUS_DOT_COLOR: Partial<Record<StepGroup["statusType"], string>> = {
  agents_retrieved: "bg-neutral-400",
  executing: "bg-yellow-600",
  execution_completed: "bg-[var(--status-success,#3BB795)]",
};

/** Per-step thinking (step_thinking for this stepId): closed by default; while closed and streaming it shows one live line. */
const StepThinking = ({ thinking, isLive }: { thinking: string; isLive: boolean }) => {
  const thinkingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (thinkingRef.current) thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
  }, [thinking]);
  return (
    <StatusAccordion title="Thinking" titleClassName="text-xs" preview={isLive ? oneLineTail(thinking) : undefined} headerClassName="py-1">
      <div className="relative">
        <div ref={thinkingRef} className="yScrollbar max-h-[10vh] overflow-y-auto text-sm text-neutral-400 dark:text-white/50">
          <Markdown content={thinking} />
        </div>
        <ComponentShadow className="" scrollRef={thinkingRef} />
      </div>
    </StatusAccordion>
  );
};

/**
 * One row per stepId: repeated status logs for the same step never add rows — the first title stays. Under the title: the step's
 * agents (logo + name), then that step's thinking.
 */
const StepStatusLog = ({ group, thinking, isActive, isStreaming }: {
  group: StepGroup; thinking?: string; isActive: boolean; isStreaming: boolean;
}) => {
  const resolvePluginLogoUrl = usePluginLogo(); // (name, agentId) => url | undefined — host-app lookup
  const isCompleted = group.statusType === "execution_completed";
  const isDone = isCompleted || !isActive;
  const hasThinking = !!thinking?.trim();

  return (
    <div className="w-full">
      <StatusAccordion status={isDone ? "done" : isStreaming ? "loading" : "none"} title={group.title || `Step ${group.stepId}`} collapsible={false} />
      {(!!group.plugins.length || hasThinking) && (
        <div className="ml-2 space-y-1 border-l border-neutral-200 py-1 pl-5 dark:border-neutral-700">
          {!!group.plugins.length && (
            <div className="flex flex-wrap items-center gap-2">
              {group.plugins.map((plugin) => {
                const logoUrl = resolvePluginLogoUrl(plugin.name, plugin.agentId) || DEFAULT_PLUGIN_LOGO_URL;
                return (
                  <div key={plugin.key} className="flex items-center gap-2 rounded-md bg-[#CFCFCF66] p-1 pr-2 dark:bg-[#30303066]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="" className="size-5 rounded-[6px]" onError={(e) => { e.currentTarget.src = DEFAULT_PLUGIN_LOGO_URL; }} />
                    <span className="text-sm text-neutral-600 dark:text-neutral-200">{plugin.name}</span>
                    {plugin.count > 1 && <span className="text-sm text-neutral-500 dark:text-neutral-400">×{plugin.count}</span>}
                    <span aria-hidden className={twMerge("size-1.5 shrink-0 rounded-full", plugin.failed ? "bg-red-500" : STATUS_DOT_COLOR[group.statusType] ?? "bg-neutral-400")} />
                  </div>
                );
              })}
            </div>
          )}
          {hasThinking && <StepThinking thinking={thinking!} isLive={!isDone && isStreaming} />}
        </div>
      )}
    </div>
  );
};

export default function StatusLogBlock({ message, isStreaming, stepClarifications }: {
  message: BotMessageType; isStreaming: boolean; stepClarifications?: Record<string, ReactNode>;
}) {
  if (!message.statusLogs?.length && !message.planningAnswer?.trim() && !message.pluginThinking?.trim() && !message.fulfillmentThinking?.trim()) return null;

  const items = groupStatusLogs(message.statusLogs ?? []);
  const hasAnswer = !!message.message?.trim();
  const lastStepId = [...items].reverse().find((i) => i.kind === "step")?.group.stepId;
  const planTitle = message.statusLogs?.find((l) => l.statusType === "plan_created" && l.queryPlan?.title)?.queryPlan?.title;

  return (
    <div className="relative w-full space-y-1">
      {planTitle && <p className="py-1.5 text-base leading-7 text-neutral-700 dark:text-neutral-200">{planTitle}</p>}
      {/* Only plan steps are shown; logs without stepId are NOT rendered */}
      {items.map((item) => {
        if (item.kind !== "step") return null;
        return (
          <Fragment key={`step-${item.group.stepId}`}>
            <StepStatusLog
              group={item.group}
              thinking={message.stepThinking?.[item.group.stepId]}
              isActive={item.group.stepId === lastStepId && !hasAnswer}
              isStreaming={isStreaming}
            />
            {stepClarifications?.[item.group.stepId] && <div className="pb-2 pt-1">{stepClarifications[item.group.stepId]}</div>}
          </Fragment>
        );
      })}
    </div>
  );
}
