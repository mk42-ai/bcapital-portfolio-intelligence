"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Newspaper, MessageSquare, Settings, Building2, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { useArtifacts } from "@/lib/artifacts/store";
import type { KeyboardEvent } from "react";

/** a33: arrow-key roving between nav items (ArrowDown/Right → next, ArrowUp/Left → prev, Home/End; wraps). Tab order is untouched. */
function onNavKeyDown(e: KeyboardEvent<HTMLElement>) {
  const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("a[data-testid^='nav-']"));
  const cur = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (cur < 0 || links.length === 0) return;
  const last = links.length - 1;
  let next: number | null = null;
  switch (e.key) {
    case "ArrowDown": case "ArrowRight": next = cur === last ? 0 : cur + 1; break;
    case "ArrowUp": case "ArrowLeft": next = cur === 0 ? last : cur - 1; break;
    case "Home": next = 0; break;
    case "End": next = last; break;
  }
  if (next == null) return;
  e.preventDefault();
  links[next]?.focus();
}
const ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2, match: "/compan" },
  { href: "/news", label: "News Pulse", icon: Newspaper },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/artifacts", label: "Artifacts", icon: Archive },
  { href: "/settings", label: "Settings", icon: Settings },
];
/** Primary nav items. `collapsed` (desktop) shows icons only with a title tooltip; labels stay in the accessibility tree. */
export function Nav({ collapsed = false }: { collapsed?: boolean }) {
  const path = usePathname();
  const { items: artifacts } = useArtifacts();
  const artifactCount = artifacts.length;
  return (
    <nav aria-label="Primary" className={cn("flex items-center gap-1 overflow-x-auto lg:mt-3 lg:flex-col lg:items-stretch lg:gap-1", collapsed && "lg:items-center")} data-testid="primary-nav" onKeyDown={onNavKeyDown}>
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const active = path === href || path.startsWith(match ?? href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} data-testid={`nav-${href.slice(1)}`}
            className={cn("relative flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-surface-3 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground", collapsed && "lg:size-10 lg:justify-center lg:px-0")}>
            <Icon className="size-4 shrink-0" aria-hidden /><span className={cn("hidden sm:inline", collapsed && "lg:sr-only")}>{label}</span><span className="sr-only sm:hidden">{label}</span>
            {href === "/artifacts" && artifactCount > 0 && <ArtifactsCount count={artifactCount} collapsed={collapsed} />}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Artifact count merged INTO the Artifacts nav item (no floating badge anywhere in the rail): a small charcoal pill at the right end of the
 * link; icon-only collapsed rail → a green dot with the count in `title`. Hidden when there are no artifacts.
 */
function ArtifactsCount({ count, collapsed }: { count: number; collapsed: boolean }) {
  const text = count > 99 ? "99+" : String(count);
  const label = `${count} artifact${count === 1 ? "" : "s"}`;
  return (
    <>
      <span data-testid="nav-artifacts-count" data-count={count} title={label} aria-label={label}
        className={cn("ml-auto hidden min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold leading-5 text-background tabular-nums sm:inline-flex", collapsed && "lg:hidden")}>{text}</span>
      {collapsed && <span data-testid="nav-artifacts-dot" title={label} aria-hidden className="absolute right-1.5 top-1.5 hidden size-2 rounded-full bg-[#0AC985] ring-2 ring-background lg:block" />}
    </>
  );
}
