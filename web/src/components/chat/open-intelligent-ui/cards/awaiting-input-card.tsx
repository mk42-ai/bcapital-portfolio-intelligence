"use client";
/**
 * awaiting_input / clarification card (Agent 11): question(s) with quick-reply option chips + free text; Reply resumes the SAME session
 * through `onAnswer` (Agent 14's resume route). Illustration: /assets/awaiting-input-256.webp (local, transparent).
 */
import { useState } from "react";
import { Check, MessageSquareMore } from "lucide-react";
import type { Prompt } from "../stream-store";

type InputPrompt = Extract<Prompt, { kind: "awaiting_input" | "clarification" }>;
export function AwaitingInputCard({ prompt, sessionId, onAnswer }: { prompt: InputPrompt; sessionId: string | null; onAnswer: (text: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({}); const [done, setDone] = useState<string | null>(null); void sessionId;
  if (done) return <div className="oiu-prompt oiu-prompt--done" data-testid="prompt-done"><Check className="size-4" aria-hidden /> {done}</div>;
  const queries = prompt.kind === "clarification" ? prompt.queries : [{ question: prompt.prompt, options: prompt.options }];
  return (
    <form className="oiu-prompt oiu-prompt--clarify" data-testid="clarification-form" onSubmit={(e) => { e.preventDefault(); const answer = queries.map((q, i) => `${q.question}: ${vals[String(i)] ?? ""}`).join("\n"); onAnswer(answer); setDone("Answer sent."); }}>
      <p className="oiu-prompt__title"><MessageSquareMore className="size-4" aria-hidden /> The agent needs your input</p>
      {queries.map((q, i) => (
        <div key={i} className="oiu-prompt__q">
          <p className="oiu-prompt__text">{q.question}</p>
          {q.options?.length ? <div className="oiu-prompt__chips">{q.options.map((o) => <button type="button" key={o} className={`oiu-prompt__chip${vals[String(i)] === o ? " oiu-prompt__chip--on" : ""}`} onClick={() => setVals((v) => ({ ...v, [String(i)]: o }))}>{o}</button>)}</div> : null}
          <input className="oiu-prompt__input" placeholder="Type an answer…" value={vals[String(i)] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [String(i)]: e.target.value }))} />
        </div>
      ))}
      <div className="oiu-prompt__actions"><button type="submit" className="oiu-prompt__btn oiu-prompt__btn--primary">Reply</button></div>
    </form>
  );
}
