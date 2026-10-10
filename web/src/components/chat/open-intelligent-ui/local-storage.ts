"use client";
import type { ChatStorage, Message, Thread, UserMessage } from "@openuidev/react-headless";
/**
 * ThreadStorage backed by localStorage — keeps the chat history in the browser (the same place the previous custom chat UI kept it).
 * Keys: `bcap.chat.threads.v2` (thread list), `bcap.chat.thread.v2.<id>` (AG-UI messages), `bcap.chat.session.v2.<id>` (OnDemand sessionId).
 * The legacy v1 threads (`bcap.chat.threads.v1`) are imported once on first load so nothing is lost by the UI swap.
 */
const LIST = "bcap.chat.threads.v2"; const MSG = (id: string) => `bcap.chat.thread.v2.${id}`; const SES = (id: string) => `bcap.chat.session.v2.${id}`;
const LEGACY = "bcap.chat.threads.v1";
const read = <T,>(k: string, fb: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fb; } catch { return fb; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };
const title = (m: UserMessage) => (typeof m.content === "string" ? m.content : "").replace(/\s+/g, " ").trim().slice(0, 48) || "New conversation";

function importLegacy() {
  if (typeof window === "undefined" || localStorage.getItem(LIST) !== null) return;
  type LegacyMsg = { id: string; role: "user" | "assistant"; parts: { type: string; text?: string; url?: string }[]; createdAt: string };
  const legacy = read<{ id: string; sessionId: string | null; title: string; createdAt: string; messages: LegacyMsg[] }[]>(LEGACY, []);
  const threads: Thread[] = [];
  for (const t of legacy) {
    threads.push({ id: t.id, title: t.title, createdAt: t.createdAt });
    const msgs: Message[] = t.messages.map((m) => ({ id: m.id, role: m.role, content: m.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("") } as Message));
    write(MSG(t.id), msgs); if (t.sessionId) write(SES(t.id), t.sessionId);
  }
  write(LIST, threads);
}
export const sessionFor = (threadId: string) => read<string | null>(SES(threadId), null);
export const rememberSession = (threadId: string, sessionId: string) => write(SES(threadId), sessionId);

/** Real citations (`CUSTOM ondemand.sources`, incl. `imageUrl`) keyed by a hash of the answer text — OpenUI assigns its own message ids, so the text is the stable join key. */
export type StoredSource = { url: string; title: string; sourceName: string; imageUrl?: string };
const SRC = (h: string) => `bcap.chat.sources.v2.${h}`;
export const sourcesKey = (text: string) => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0; return `${h.toString(36)}-${text.length}`; };
export const rememberSources = (key: string, sources: StoredSource[]) => write(SRC(key), sources);
export const sourcesFor = (key: string) => read<StoredSource[] | null>(SRC(key), null);

export function localThreadStorage(): ChatStorage {
  importLegacy();
  return {
    thread: {
      async listThreads() { return { threads: read<Thread[]>(LIST, []) }; },
      async createThread(firstMessage) {
        const t: Thread = { id: crypto.randomUUID(), title: title(firstMessage), createdAt: new Date().toISOString() };
        write(LIST, [t, ...read<Thread[]>(LIST, [])]); write(MSG(t.id), [{ ...firstMessage, id: firstMessage.id ?? crypto.randomUUID() }]); return t;
      },
      async getMessages(threadId) { return read<Message[]>(MSG(threadId), []); },
      async updateThread(thread) { write(LIST, read<Thread[]>(LIST, []).map((t) => (t.id === thread.id ? thread : t))); return thread; },
      async deleteThread(id) { write(LIST, read<Thread[]>(LIST, []).filter((t) => t.id !== id)); try { localStorage.removeItem(MSG(id)); localStorage.removeItem(SES(id)); } catch {} },
    },
  };
}
/** Persist the live thread's messages (called from a store subscriber so every streamed update is saved). */
export const saveMessages = (threadId: string, messages: Message[]) => write(MSG(threadId), messages);
