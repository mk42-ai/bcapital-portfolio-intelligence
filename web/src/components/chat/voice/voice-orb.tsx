"use client";
/**
 * Voice orb (Agent 5): idle / listening / thinking / speaking / error.
 * The poster (one of the three local orb illustrations, ASSET.voiceIdle / voiceListening / voiceThinking) IS the orb; speaking reuses the
 * listening poster, error reuses the idle poster with a muted filter. A brand-green SVG ring layer sits on top and carries the motion:
 *   listening → ring pulse scaled by --voice-level (0..1, set on the root by the dock via style.setProperty, no React re-render per frame)
 *   thinking  → slow dotted-ring rotation · speaking → soft breathing · idle → still poster.
 * All motion lives in voice.css under @media (prefers-reduced-motion: no-preference); under `reduce` only the poster renders.
 * Usable at 44 px in the voice panel and at 28 px inside the mic button (`size`). Keep data-testid="voice-orb" (e2e/voice-orb.spec.ts).
 */
import { forwardRef, type CSSProperties } from "react";
import { ASSET } from "@/lib/assets";

export type VoiceOrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

const POSTER: Record<VoiceOrbState, string> = {
  idle: ASSET.voiceIdle,
  error: ASSET.voiceIdle,
  listening: ASSET.voiceListening,
  speaking: ASSET.voiceListening,
  thinking: ASSET.voiceThinking,
};

export type VoiceOrbProps = {
  state: VoiceOrbState;
  /** prefers-reduced-motion (null until mounted → treated as "unknown", CSS media query still applies). */
  reduced: boolean | null;
  /** Rendered box in px (44 in the voice panel, 28 inside the mic button). */
  size?: number;
  className?: string;
};

export const VoiceOrb = forwardRef<HTMLDivElement, VoiceOrbProps>(function VoiceOrb({ state, reduced, size = 44, className }, ref) {
  const style = { "--orb-size": `${size}px` } as CSSProperties;
  return (
    <div
      ref={ref}
      className={className ? `voice-orb ${className}` : "voice-orb"}
      data-testid="voice-orb"
      data-state={state}
      data-size={size <= 32 ? "sm" : "md"}
      data-reduced-motion={reduced ? "true" : undefined}
      aria-hidden
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="voice-orb__poster" src={POSTER[state]} alt="" width={size} height={size} draggable={false} decoding="async" />
      <svg className="voice-orb__rings" viewBox="0 0 44 44" focusable="false">
        <circle className="voice-orb__ring voice-orb__ring--2" cx="22" cy="22" r="20" />
        <circle className="voice-orb__ring voice-orb__ring--1" cx="22" cy="22" r="17" />
      </svg>
    </div>
  );
});
