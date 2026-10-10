"use client";
/**
 * Full-screen chat canvas (Agents 19–24): top bar (52 px) → conversation column (full width/height, messages centred ≤800 px) → composer
 * pinned at the bottom; the inspector is a slide-over drawer. The old nested card layout, page header and footer are gone.
 */
import "./canvas.css";
import type { PitchbookResponse } from "@/lib/types";
import { ChatShell } from "@/components/chat/open-intelligent-ui/chat-shell";
import type { CoCtx } from "@/components/chat/open-intelligent-ui/stream-store";
import { ChatTopBar } from "./top-bar";
import { InspectorDrawer } from "./inspector-drawer";

export type SidebarCompany = { slug: string; name: string; sector: string; logo_url?: string | null; score: number; news: number; signal?: number | null; signal_confidence?: number | null; signal_percentile?: number | null };
export function ChatCanvas({ companies, fetchedAt, source, pitchbook, sidebar }: { companies: CoCtx[]; fetchedAt?: string; source?: "live" | "snapshot"; pitchbook: Record<string, PitchbookResponse | null>; sidebar: SidebarCompany[] }) {
  return (
    <div className="chat-canvas" data-testid="chat-canvas">
      <ChatTopBar fetchedAt={fetchedAt} source={source} />
      <div className="chat-canvas__body">
        <div className="chat-canvas__thread"><ChatShell companies={companies} fetchedAt={fetchedAt} /></div>
        <InspectorDrawer companies={sidebar} pitchbook={pitchbook} />
      </div>
    </div>
  );
}
