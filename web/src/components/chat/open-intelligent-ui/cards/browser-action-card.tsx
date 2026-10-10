"use client";
/**
 * awaiting_browser_action card (Agent 13): the agent asks the user to act in a live browser (novnc url). Done / Cancel resume the SAME
 * session through `onAnswer` (Agent 14's resume route). Illustration: /assets/browser-action-256.webp (local, transparent).
 */
import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import type { Prompt } from "../stream-store";

type BrowserPrompt = Extract<Prompt, { kind: "awaiting_browser_action" }>;
export function BrowserActionCard({ prompt, sessionId, onAnswer }: { prompt: BrowserPrompt; sessionId: string | null; onAnswer: (text: string) => void }) {
  const [done, setDone] = useState<string | null>(null); void sessionId;
  if (done) return <div className="oiu-prompt oiu-prompt--done" data-testid="prompt-done"><Check className="size-4" aria-hidden /> {done}</div>;
    return (
      <div className="oiu-prompt oiu-prompt--approve" data-testid="approval-card" role="group" aria-label="Approval needed">
        <p className="oiu-prompt__title"><ShieldCheck className="size-4" aria-hidden /> The agent wants to perform a browser action{prompt.action ? ` (${prompt.action})` : ""}</p>
        {prompt.message && <p className="oiu-prompt__text">{prompt.message}</p>}
        <div className="oiu-prompt__actions">{prompt.url && <a className="oiu-prompt__btn oiu-prompt__btn--primary" href={prompt.url} target="_blank" rel="noopener noreferrer">Open live browser</a>}<button type="button" className="oiu-prompt__btn" onClick={() => { onAnswer("Done — I completed the browser action."); setDone("Approval sent."); }}>Done</button><button type="button" className="oiu-prompt__btn" onClick={() => { onAnswer("Cancel the browser action."); setDone("Cancelled."); }}>Cancel</button></div>
      </div>
    );
}
