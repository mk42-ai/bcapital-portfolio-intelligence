"use client";
/**
 * awaiting_browser_action card (Agent 13): the agent needs the user in the live browser (noVNC url) for a step only a human can do —
 * seats / captcha / payment / login. "I'm done" and "Cancel" resume the SAME OnDemand session through `onAnswer` (Agent 14's resume
 * route; the shell carries context.sessionId). Illustration: ASSET.browserAction (local, transparent, 72 px).
 */
import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { ASSET } from "@/lib/assets";
import "./cards.css";
import type { Prompt } from "../stream-store";

type BrowserPrompt = Extract<Prompt, { kind: "awaiting_browser_action" }>;
type ActionKey = "seats" | "captcha" | "payment" | "login" | "other";
const ACTION_LABEL: Record<ActionKey, string> = { seats: "Seat selection", captcha: "Captcha", payment: "Payment", login: "Login", other: "Browser step" };
const actionKey = (a: string | null): ActionKey => { const k = (a ?? "").trim().toLowerCase(); return k === "seats" || k === "captcha" || k === "payment" || k === "login" ? k : "other"; };
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);

export const BROWSER_DONE_TEXT = "Done — I completed the browser action.";
export const BROWSER_CANCEL_TEXT = "Cancel the browser action.";

export function BrowserActionCard({ prompt, sessionId, onAnswer }: { prompt: BrowserPrompt; sessionId: string | null; onAnswer: (text: string) => void }) {
  const [done, setDone] = useState<string | null>(null);
  void sessionId; // the shell attaches context.sessionId to the resume POST; kept for API parity with the sibling cards
  const key = actionKey(prompt.action);
  const url = safeUrl(prompt.url);
  if (done) return <div className="oiu-prompt oiu-prompt--done" data-testid="prompt-done"><Check className="size-4" aria-hidden /> {done}</div>;
  const answer = (text: string, label: string) => { setDone(label); onAnswer(text); };
  return (
    <div className="oiu-prompt oiu-card--browser" data-testid="approval-card" data-action={key} role="group" aria-label="Live browser action needed">
      <div className="oiu-card--browser__head" data-testid="card-browser-action" data-action={key}>
        <img className="oiu-card--browser__art" src={ASSET.browserAction} width={72} height={72} alt="" aria-hidden decoding="async" data-testid="card-browser-action-art" />
        <div className="oiu-card--browser__body">
          <p className="oiu-prompt__title oiu-card--browser__title">
            <span>The agent needs you in the live browser</span>
            <span className="oiu-card--browser__chip" data-testid="card-browser-action-chip">{ACTION_LABEL[key]}</span>
          </p>
          {prompt.message && <p className="oiu-prompt__text" data-testid="card-browser-action-message">{prompt.message}</p>}
        </div>
      </div>
      <div className="oiu-prompt__actions oiu-card--browser__actions">
        {url && <a className="oiu-prompt__btn oiu-prompt__btn--primary oiu-card--browser__open" href={url} target="_blank" rel="noopener noreferrer" data-testid="card-browser-action-open"><ExternalLink className="size-3.5" aria-hidden /> Open live browser</a>}
        <button type="button" className="oiu-prompt__btn" data-testid="card-browser-action-done" onClick={() => answer(BROWSER_DONE_TEXT, "Resuming the agent.")}>I&rsquo;m done</button>
        <button type="button" className="oiu-prompt__btn oiu-card--browser__cancel" data-testid="card-browser-action-cancel" onClick={() => answer(BROWSER_CANCEL_TEXT, "Cancelled.")}>Cancel</button>
      </div>
    </div>
  );
}
