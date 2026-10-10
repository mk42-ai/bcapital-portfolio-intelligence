"use client";
/**
 * Voice orb (Agent 5): idle / listening / thinking / speaking / error. Uses the three local orb assets (/assets/voice-orb-{idle,listening,thinking}-256.webp)
 * as posters (always under reduced motion) with the brand-green SVG rings animating on top. `orbRef` receives --voice-level from the dock.
 * SKELETON — Agent 5 implements the final visuals + voice.css rules; voice-dock.tsx (Agent 15) renders <VoiceOrb orbRef={…} state={…} reduced={…} />.
 */
import { forwardRef } from "react";
import { ASSET } from "@/lib/assets";
export type VoiceOrbState = "idle" | "listening" | "thinking" | "speaking" | "error";
const POSTER: Record<VoiceOrbState, string> = { idle: ASSET.voiceIdle, error: ASSET.voiceIdle, listening: ASSET.voiceListening, speaking: ASSET.voiceListening, thinking: ASSET.voiceThinking };
export const VoiceOrb = forwardRef<HTMLDivElement, { state: VoiceOrbState; reduced: boolean | null; size?: number }>(function VoiceOrb({ state, reduced, size = 44 }, ref) {
  return (
    <div ref={ref} className="voice-orb" data-testid="voice-orb" data-state={state} aria-hidden style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44"><circle className="voice-orb__ring voice-orb__ring--2" cx="22" cy="22" r="19" /><circle className="voice-orb__ring voice-orb__ring--1" cx="22" cy="22" r="15" /><circle className="voice-orb__core" cx="22" cy="22" r="10" /></svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="voice-orb__poster" src={POSTER[state]} data-reduced-motion={reduced ? "true" : undefined} alt="" width={size} height={size} />
    </div>
  );
});
