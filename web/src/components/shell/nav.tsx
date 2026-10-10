"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Newspaper, MessageSquare, Settings, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
const ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/company/perplexity-ai", label: "Companies", icon: Building2, match: "/company" },
  { href: "/news", label: "News Pulse", icon: Newspaper },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="flex items-center gap-1 overflow-x-auto lg:mt-4 lg:flex-col lg:items-stretch lg:gap-1.5">
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const active = path === href || path.startsWith(match ?? href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-surface-3 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground")}>
            <Icon className="size-4 shrink-0" aria-hidden /><span className="hidden sm:inline">{label}</span><span className="sr-only sm:hidden">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
