"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { Nav } from "./nav";
import { cn } from "@/lib/utils";

const KEY = "bcap.nav.rail";
/** Expanded width (px), exposed as CSS var `--rail-w`. Hard cap from the owner: ≤ 224 px when expanded; 56 px (≤ 64) icon-only when collapsed, persisted in localStorage. */
export const NAV_EXPANDED_PX = 224;
export const NAV_COLLAPSED_PX = 56;

/**
 * The ONE primary navigation rail (desktop): brand mark, six routes (Artifacts carries its count pill), backend status. Collapses to icon-only (56 px) with a toggle
 * and remembers the choice in localStorage; on /chat the rail starts collapsed so the thread gets the whole screen.
 * On < lg it renders as the sticky top bar. There is no second navigation anywhere (the chat shell's thread sidebar is removed).
 */
export function NavRail({ status }: { status?: React.ReactNode }) {
  const path = usePathname();
  const onChat = path?.startsWith("/chat") ?? false;
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let v: string | null = null; try { v = window.localStorage.getItem(KEY); } catch { /* ignore */ }
    setCollapsed(v ? v === "collapsed" : onChat);
    setMounted(true);
  }, [onChat]);
  const toggle = () => setCollapsed((c) => { const n = !c; try { window.localStorage.setItem(KEY, n ? "collapsed" : "expanded"); } catch { /* ignore */ } return n; });
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside
      data-testid="nav-rail" data-collapsed={collapsed ? "true" : "false"} data-mounted={mounted ? "true" : "false"}
      style={{ ["--rail-w" as string]: `${NAV_EXPANDED_PX}px`, ["--rail-w-collapsed" as string]: `${NAV_COLLAPSED_PX}px`, ["--nav-w" as string]: collapsed ? "var(--rail-w-collapsed)" : "var(--rail-w)" }}
      className={cn(
        "sticky top-0 z-40 flex w-full items-center justify-between gap-3 border-b border-border bg-background px-3 py-2",
        "lg:h-dvh lg:w-[var(--nav-w)] lg:shrink-0 lg:flex-col lg:items-stretch lg:justify-start lg:border-b-0 lg:border-r lg:px-2 lg:py-3 lg:transition-[width]",
      )}
      aria-label="Primary navigation">
      <div className={cn("flex items-center", collapsed ? "lg:justify-center" : "lg:justify-between lg:px-1")}>
        <Link href="/overview" className={cn("flex items-center gap-2 rounded-lg px-1 py-1", collapsed && "lg:hidden")} data-testid="brand-home">
          <BrandLogo height={24} /><span className="sr-only">Home</span>
        </Link>
        {/* `nav-toggle` (legacy testid, kept) wraps the actual button `rail-toggle`; both resolve to the same click target. */}
        <span data-testid="nav-toggle" className="hidden shrink-0 lg:inline-flex">
          <button type="button" onClick={toggle} data-testid="rail-toggle" aria-expanded={!collapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <Icon className="size-4" aria-hidden />
          </button>
        </span>
      </div>
      <Nav collapsed={collapsed} />
      {/* a22: ⌘K hint — opens the company switcher (command-k.tsx) via the bcap:cmdk window event. */}
      <button type="button" data-testid="cmdk-hint" onClick={() => window.dispatchEvent(new Event("bcap:cmdk"))} aria-label="Switch company (Ctrl or Cmd + K)" title="Switch company (⌘K / Ctrl+K)"
        className={cn("mt-1 hidden items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:inline-flex", collapsed && "lg:justify-center lg:px-0")}>
        <Command className="size-4 shrink-0" aria-hidden /><span className={cn(collapsed && "lg:sr-only")}>Switch company <kbd className="ml-1 rounded border border-border-strong bg-surface-2 px-1 font-mono text-[10px]">⌘K</kbd></span>
      </button>
      {/* The artifact count lives INSIDE the Artifacts nav item (nav.tsx → nav-artifacts-count); no floating toggle in the rail. */}
      <div className={cn("flex items-center lg:mt-auto lg:block", collapsed ? "lg:hidden" : "lg:px-2")}>{status}</div>
    </aside>
  );
}
