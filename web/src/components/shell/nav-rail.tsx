"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { Nav } from "./nav";
import { cn } from "@/lib/utils";

const KEY = "bcap.nav.rail";
/** Expanded width (px). Hard cap from the owner: ≤ 224 px when expanded; 56 px icon-only when collapsed. */
export const NAV_EXPANDED_PX = 224;
export const NAV_COLLAPSED_PX = 56;

/**
 * The ONE primary navigation rail (desktop): brand mark, five routes, backend status. Collapses to icon-only (56 px) with a toggle
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
      style={{ ["--nav-w" as string]: `${collapsed ? NAV_COLLAPSED_PX : NAV_EXPANDED_PX}px` }}
      className={cn(
        "sticky top-0 z-40 flex w-full items-center justify-between gap-3 border-b border-border bg-background px-3 py-2",
        "lg:h-dvh lg:w-[var(--nav-w)] lg:shrink-0 lg:flex-col lg:items-stretch lg:justify-start lg:border-b-0 lg:border-r lg:px-2 lg:py-3 lg:transition-[width]",
      )}
      aria-label="Primary navigation">
      <div className={cn("flex items-center", collapsed ? "lg:justify-center" : "lg:justify-between lg:px-1")}>
        <Link href="/overview" className={cn("flex items-center gap-2 rounded-lg px-1 py-1", collapsed && "lg:hidden")} data-testid="brand-home">
          <BrandLogo height={24} /><span className="sr-only">Home</span>
        </Link>
        <button type="button" onClick={toggle} data-testid="nav-toggle" aria-expanded={!collapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="hidden size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:inline-flex">
          <Icon className="size-4" aria-hidden />
        </button>
      </div>
      <Nav collapsed={collapsed} />
      <div className={cn("flex items-center lg:mt-auto lg:block", collapsed ? "lg:hidden" : "lg:px-2")}>{status}</div>
    </aside>
  );
}
