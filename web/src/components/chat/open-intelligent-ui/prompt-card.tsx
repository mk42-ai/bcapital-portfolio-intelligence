"use client";
/**
 * Interactive prompt dispatcher: clarification / awaiting_input → <AwaitingInputCard>, require_creds → <RequireCredsCard>,
 * awaiting_browser_action → <BrowserActionCard>. Each card lives in ./cards/ and is owned by one agent (11 / 12 / 13).
 * `onAnswer(text)` resumes the SAME OnDemand session (Agent 14: /api/chat/resume) — the shell passes a processMessage-backed callback.
 */
import type { Prompt } from "./stream-store";
import { AwaitingInputCard } from "./cards/awaiting-input-card";
import { RequireCredsCard } from "./cards/require-creds-card";
import { BrowserActionCard } from "./cards/browser-action-card";

export function PromptCard({ prompt, sessionId, onAnswer }: { prompt: Prompt; sessionId: string | null; onAnswer: (text: string) => void }) {
  if (prompt.kind === "require_creds") return <RequireCredsCard prompt={prompt} sessionId={sessionId} />;
  if (prompt.kind === "awaiting_browser_action") return <BrowserActionCard prompt={prompt} sessionId={sessionId} onAnswer={onAnswer} />;
  return <AwaitingInputCard prompt={prompt} sessionId={sessionId} onAnswer={onAnswer} />;
}
