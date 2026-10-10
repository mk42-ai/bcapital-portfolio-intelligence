"use client";
/**
 * Empty-thread canvas (Agent 7): ChatGPT/Claude-style centred block — new-chat illustration, one-line title,
 * compact context chips and three starter cards. Recent threads live in the nav rail (Agent 21), not here.
 * Rendered inside <AgentInterface.Welcome>; the library hides it once the first message exists.
 */
import { useEffect, useState } from "react";
import { useThread } from "@openuidev/react-ui";
import { Sparkles } from "lucide-react";
import { ASSET } from "@/lib/assets";
import { fmtScore } from "@/lib/format";
import type { CoCtx } from "./stream-store";
import "./welcome.css";

export const starters = [
  { displayText: "Latest Fervo news", prompt: "What is the latest news about Fervo Energy? Cite sources.", icon: null },
  { displayText: "Biggest movers", prompt: "Which of my context companies moved most since the last sentiment run, and why?", icon: null },
  { displayText: "Compare two", prompt: "Compare Apptronik and WRITER on funding momentum and recent sentiment.", icon: null },
  { displayText: "LP update draft", prompt: "Draft a one-paragraph LP update on the portfolio's sentiment this week.", icon: null },
];

export function ChatWelcome({ companies }: { companies: CoCtx[] }) {
  const processMessage = useThread((s) => s.processMessage);
  const isRunning = useThread((s) => s.isRunning);
  // Context companies come from localStorage settings (client only): render the chip row only after mount so SSR and the first client render match (React #418).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const chips = mounted ? companies : [];
  return (
    <div className="oiu-welcome bc-welcome" data-testid="chat-welcome">
      <img className="bc-welcome__art" src={ASSET.newChat} alt="" width={160} height={160} decoding="async" fetchPriority="high" />
      <h2 className="oiu-welcome__title bc-welcome__title">Ask the portfolio</h2>
      {chips.length > 0 && (
        <ul className="oiu-welcome__chips bc-welcome__chips" aria-label="Context companies" data-testid="welcome-context">
          {chips.map((c) => (
            <li key={c.slug} className="oiu-welcome__chip bc-welcome__chip">
              <span className="oiu-welcome__dot bc-welcome__dot" aria-hidden />
              {c.name}
              <span className="oiu-welcome__chip-score bc-welcome__score">{fmtScore(c.sentiment.score)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="oiu-welcome__starters bc-welcome__starters" data-testid="welcome-starters">
        {starters.slice(0, 3).map((st) => (
          <button key={st.prompt} type="button" className="oiu-welcome__starter bc-welcome__starter" data-testid="welcome-starter" disabled={isRunning} onClick={() => { void processMessage({ role: "user", content: st.prompt }); }}>
            <Sparkles className="bc-welcome__icon" aria-hidden />
            <span className="bc-welcome__starter-body">
              <strong>{st.displayText}</strong>
              <span className="oiu-welcome__starter-prompt bc-welcome__prompt">{st.prompt}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
