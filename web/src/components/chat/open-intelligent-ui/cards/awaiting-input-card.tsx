"use client";
/**
 * awaiting_input / clarification card (Agent 11): illustration (ASSET.awaitingInput, 72 px, left) + the question(s), quick-reply option chips
 * (brand green when selected), an optional free-text field and a Submit that calls `onAnswer(text)` — Agent 14's resume path continues the
 * SAME OnDemand session. Supports inputType "choice" (chips only unless `allowCustom`) and plain text prompts (no options → text only).
 * After submit the card collapses to a disabled "Answer sent" row (testid prompt-done).
 */
import { useState } from "react";
import { Check, MessageSquareMore } from "lucide-react";
import type { Prompt } from "../stream-store";
import { ASSET } from "@/lib/assets";
import "./cards.css";

type InputPrompt = Extract<Prompt, { kind: "awaiting_input" | "clarification" }>;
/** Optional AWAITING_INPUT marker fields the store may forward later ({"inputType":"choice","options":[…],"allowCustom":true}). */
type Extra = { inputType?: string; allowCustom?: boolean };
type Query = { question: string; options: string[]; freeText: boolean };

function toQueries(prompt: InputPrompt): Query[] {
  if (prompt.kind === "clarification") return prompt.queries.map((q) => ({ question: q.question, options: q.options ?? [], freeText: true }));
  const { inputType, allowCustom } = prompt as InputPrompt & Extra;
  const options = prompt.options ?? [];
  const choiceOnly = inputType === "choice" && options.length > 0 && allowCustom !== true;
  return [{ question: prompt.prompt, options, freeText: !choiceOnly }];
}

export function AwaitingInputCard({ prompt, sessionId, onAnswer }: { prompt: InputPrompt; sessionId: string | null; onAnswer: (text: string) => void }) {
  const [vals, setVals] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);
  void sessionId; // the shell injects context.sessionId on the resume POST
  const queries = toQueries(prompt);
  const set = (i: number, v: string) => setVals((prev) => ({ ...prev, [i]: v }));
  const ready = queries.every((_, i) => (vals[i] ?? "").trim().length > 0);

  if (done) {
    return (
      <div className="oiu-card oiu-card--input oiu-card--input--done" data-testid="prompt-done" aria-disabled="true">
        <Check className="size-4" aria-hidden /> Answer sent
      </div>
    );
  }

  return (
    <section className="oiu-card oiu-card--input" data-testid="card-awaiting-input" aria-label="The agent needs your input">
      {/* eslint-disable-next-line @next/next/no-img-element -- local transparent asset, fixed 72 px box */}
      <img className="oiu-card--input__art" src={ASSET.awaitingInput} width={72} height={72} alt="" aria-hidden data-testid="card-awaiting-input-art" />
      <form
        className="oiu-card--input__form"
        data-testid="clarification-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          const answer = queries.length === 1 ? (vals[0] ?? "").trim() : queries.map((q, i) => `${q.question}: ${(vals[i] ?? "").trim()}`).join("\n");
          setDone(true);
          onAnswer(answer);
        }}
      >
        <p className="oiu-card--input__title"><MessageSquareMore className="size-4" aria-hidden /> Your input is needed</p>
        {queries.map((q, i) => (
          <div key={i} className="oiu-card--input__q">
            <p className="oiu-card--input__question">{q.question}</p>
            {q.options.length > 0 && (
              <div className="oiu-card--input__chips" role="group" aria-label="Options">
                {q.options.map((o) => {
                  const on = vals[i] === o;
                  return (
                    <button type="button" key={o} className={`oiu-card--input__chip${on ? " oiu-card--input__chip--on" : ""}`} aria-pressed={on} data-testid="card-awaiting-input-option" onClick={() => set(i, on ? "" : o)}>
                      {on && <Check className="size-3" aria-hidden />}{o}
                    </button>
                  );
                })}
              </div>
            )}
            {q.freeText && (
              <input className="oiu-card--input__input" data-testid="card-awaiting-input-text" placeholder={q.options.length ? "Or type your own…" : "Type your answer…"} value={vals[i] ?? ""} onChange={(e) => set(i, e.target.value)} />
            )}
          </div>
        ))}
        <div className="oiu-card--input__actions">
          <button type="submit" className="oiu-card--input__submit" data-testid="card-awaiting-input-submit" disabled={!ready}>Submit</button>
        </div>
      </form>
    </section>
  );
}
