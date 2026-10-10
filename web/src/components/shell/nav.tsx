"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Newspaper, MessageSquare, Settings, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
const ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2, match: "/compan" },
  { href: "/news", label: "News Pulse", icon: Newspaper },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];
/** Primary nav items. `collapsed` (desktop) shows icons only with a title tooltip; labels stay in the accessibility tree. */
export function Nav({ collapsed = false }: { collapsed?: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className={cn("flex items-center gap-1 overflow-x-auto lg:mt-3 lg:flex-col lg:items-stretch lg:gap-1", collapsed && "lg:items-center")} data-testid="primary-nav">
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const active = path === href || path.startsWith(match ?? href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} data-testid={`nav-${href.slice(1)}`}
            className={cn("flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-surface-3 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground", collapsed && "lg:size-10 lg:justify-center lg:px-0")}>
            <Icon className="size-4 shrink-0" aria-hidden /><span className={cn("hidden sm:inline", collapsed && "lg:sr-only")}>{label}</span><span className="sr-only sm:hidden">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
