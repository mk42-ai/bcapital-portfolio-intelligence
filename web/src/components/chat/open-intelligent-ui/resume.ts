"use client";
/**
 * Session resume for the interactive cards (Agent 14).
 *
 * When a card (clarification / awaiting_input / awaiting_browser_action) submits, the answer MUST continue the SAME OnDemand session so
 * the agent can pick the paused flow back up. The resume path is:
 *
 *   card.onAnswer(text)
 *     → resumeSession(text, { sessionId, kind, send: processMessage })
 *       (a) appends { threadId, sessionId, kind, at } to the ring buffer (getResumeLog(), dev disclosure)
 *       (b) pins stream-store.sessionId = sessionId when the card knows one (so getCurrentSessionId() resolves it even before
 *           the thread's remembered session is written)
 *       (c) returns processMessage({ role: "user", content: text })
 *     → AgentInterface POST /api/chat  (chat-shell.tsx fetch wrapper injects context.sessionId from
 *           sessionRef[threadId] → localStorage `bcap.chat.session.v2.<threadId>` → prewarm; stream-store carries the live one)
 *     → web/src/app/api/chat/route.ts reuses ctx.sessionId (no new session is created when it is present) and streams
 *           POST ${ONDEMAND_BASE_URL}/chat/v1/sessions/${sessionId}/query
 *           { query, endpointId: "predefined-deepseek-flash", responseMode: "stream", pluginIds, reasoningMode: "medium" }
 *
 * `resumeSync` is the non-streaming fallback (POST /api/chat/resume → responseMode "sync") used when no thread/AgentInterface is open.
 * Neither helper logs the answer text.
 */
import type { Prompt } from "./stream-store";
import { getCurrentThreadId, setStream } from "./stream-store";

export type ResumeKind = Prompt["kind"];
export type ResumeEntry = { threadId: string | null; sessionId: string | null; kind: ResumeKind; at: number; mode: "stream" | "sync" };
export type SendFn = (m: { role: "user"; content: string }) => Promise<unknown> | void;

const RING = 20;
const log: ResumeEntry[] = [];
const record = (e: ResumeEntry) => { log.push(e); if (log.length > RING) log.splice(0, log.length - RING); };

/** Last ≤20 resumes (newest last). Read by the dev disclosure; never contains the answer text. */
export const getResumeLog = (): readonly ResumeEntry[] => log;

/**
 * Continue the SAME session with the card's answer through the live AgentInterface thread.
 * Returns the processMessage promise (resolved when the run finishes), or a resolved promise when `send` is absent.
 */
export function resumeSession(text: string, opts: { sessionId: string | null; kind: ResumeKind; send?: SendFn; threadId?: string | null }): Promise<unknown> {
  const sessionId = opts.sessionId && /^[A-Za-z0-9]+$/.test(opts.sessionId) ? opts.sessionId : null;
  const threadId = opts.threadId ?? getCurrentThreadId() ?? null;
  record({ threadId, sessionId, kind: opts.kind, at: Date.now(), mode: "stream" });
  if (sessionId) setStream({ sessionId }, true); // the /api/chat wrapper + getCurrentSessionId() see it before the next POST
  const content = text.trim();
  if (!content || !opts.send) return Promise.resolve();
  return Promise.resolve(opts.send({ role: "user", content }));
}

export type ResumeSyncResult = { ok: boolean; status: number; answer?: string; error?: string };
/** Non-streaming fallback: POST /api/chat/resume → upstream sync query on the same session. Use only when no thread is open. */
export async function resumeSync(text: string, opts: { sessionId: string; kind: ResumeKind; pluginIds?: string[]; threadId?: string | null }): Promise<ResumeSyncResult> {
  record({ threadId: opts.threadId ?? getCurrentThreadId() ?? null, sessionId: opts.sessionId, kind: opts.kind, at: Date.now(), mode: "sync" });
  try {
    const r = await fetch("/api/chat/resume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: opts.sessionId, text, kind: opts.kind, ...(opts.pluginIds ? { pluginIds: opts.pluginIds } : {}) }) });
    const j = (await r.json().catch(() => ({}))) as Partial<ResumeSyncResult>;
    return { ok: Boolean(j.ok) && r.ok, status: typeof j.status === "number" ? j.status : r.status, answer: typeof j.answer === "string" ? j.answer : undefined, error: typeof j.error === "string" ? j.error : undefined };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message || "network error" };
  }
}
