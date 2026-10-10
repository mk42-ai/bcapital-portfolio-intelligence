"use client";
/**
 * Empty-thread canvas (Agent 7): new-chat illustration (/assets/new-chat-512.webp), context chips, three starter prompts, recent threads.
 * Rendered inside <AgentInterface.Welcome>; the library hides it once the first message exists.
 */
import { useEffect, useState } from "react";
import { useThread, useThreadList } from "@openuidev/react-ui";
import { MessageSquareMore, Sparkles } from "lucide-react";
import { fmtScore } from "@/lib/format";
import type { CoCtx } from "./stream-store";

export const starters = [
  { displayText: "Latest Fervo news", prompt: "What is the latest news about Fervo Energy? Cite sources.", icon: null },
  { displayText: "Biggest movers", prompt: "Which of my context companies moved most since the last sentiment run, and why?", icon: null },
  { displayText: "Compare two", prompt: "Compare Apptronik and WRITER on funding momentum and recent sentiment.", icon: null },
  { displayText: "LP update draft", prompt: "Draft a one-paragraph LP update on the portfolio's sentiment this week.", icon: null },
];

/** Compact welcome state (replaces the library's blank centre canvas): context chips, three starter prompts, recent threads. Hidden by the library once the first message exists. */
export function ChatWelcome({ companies }: { companies: CoCtx[] }) {
  const processMessage = useThread((s) => s.processMessage); const isRunning = useThread((s) => s.isRunning);
  const threads = useThreadList((s) => s.threads); const selectThread = useThreadList((s) => s.selectThread); const selectedId = useThreadList((s) => s.selectedThreadId);
  // Threads come from localStorage (client only): render the recent list only after mount so SSR and the first client render match (React #418).
  const [mounted, setMounted] = useState(false); useEffect(() => { setMounted(true); }, []);
  const recent = mounted ? threads.filter((t) => !t.isPending && t.id !== selectedId).slice(0, 3) : [];
  return (
    <div className="oiu-welcome" data-testid="chat-welcome">
      <h2 className="oiu-welcome__title">Ask the portfolio</h2>
      {companies.length > 0 && (
        <ul className="oiu-welcome__chips" aria-label="Context companies" data-testid="welcome-context">
          {companies.map((c) => <li key={c.slug} className="oiu-welcome__chip"><span className="oiu-welcome__dot" aria-hidden /> {c.name}<span className="oiu-welcome__chip-score">{fmtScore(c.sentiment.score)}</span></li>)}
        </ul>
      )}
      <div className="oiu-welcome__starters" data-testid="welcome-starters">
        {starters.slice(0, 3).map((st) => (
          <button key={st.prompt} type="button" className="oiu-welcome__starter" disabled={isRunning} onClick={() => { void processMessage({ role: "user", content: st.prompt }); }}>
            <Sparkles className="size-3.5" aria-hidden /><span><strong>{st.displayText}</strong><span className="oiu-welcome__starter-prompt">{st.prompt}</span></span>
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <section className="oiu-welcome__recent" aria-label="Recent threads" data-testid="welcome-recent">
          <p className="oiu-welcome__label"><MessageSquareMore className="size-3.5" aria-hidden /> Recent threads</p>
          <ul>{recent.map((t) => <li key={t.id}><button type="button" className="oiu-welcome__thread" onClick={() => selectThread(t.id)}>{t.title || "Untitled thread"}</button></li>)}</ul>
        </section>
      )}
    </div>
  );
}
