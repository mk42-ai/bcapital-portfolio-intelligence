"use client";
/**
 * Global navigation rail (Agent 21): ≤224 px expanded, 64 px icon rail collapsed, state persisted in localStorage (ui-store `navCollapsed`).
 * Items: Overview / Companies / News Pulse / Chat / Settings, the "live backend" pill, and the thread list (New Chat + threads) NESTED under
 * Chat. Replaces the old <aside> in shell.tsx AND OpenUI's "Portfolio analyst" sidebar column (deleted). SKELETON — Agent 21 implements.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Building2, LayoutDashboard, MessageSquare, Newspaper, PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { setUi, useUi } from "@/components/chat/open-intelligent-ui/ui-store";
import { readStoredThreads, useThreadBus, type BusThread } from "@/components/chat/open-intelligent-ui/thread-bus";

const ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2, match: "/compan" },
  { href: "/news", label: "News Pulse", icon: Newspaper },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function NavRail({ status }: { status: ReactNode }) {
  const path = usePathname(); const router = useRouter(); const ui = useUi(); const bus = useThreadBus();
  const [mounted, setMounted] = useState(false); useEffect(() => { setMounted(true); }, []);
  const collapsed = mounted && ui.navCollapsed;
  const threads: BusThread[] = bus.mounted ? bus.threads : mounted ? readStoredThreads() : [];
  const onChat = path.startsWith("/chat");
  const select = (id: string) => { if (bus.mounted) bus.select(id); else router.push(`/chat?thread=${encodeURIComponent(id)}`); };
  const newChat = () => { if (bus.mounted) bus.newChat(); else router.push("/chat"); };
  return (
    <aside className={cn("nav-rail", collapsed && "nav-rail--collapsed")} data-testid="nav-rail" data-collapsed={collapsed ? "true" : "false"} aria-label="Primary">
      <div className="nav-rail__head">
        <Link href="/overview" className="nav-rail__brand" aria-label="Home"><BrandLogo height={collapsed ? 20 : 24} /></Link>
        <button type="button" className="nav-rail__toggle" data-testid="nav-toggle" aria-expanded={!collapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} onClick={() => setUi({ navCollapsed: !ui.navCollapsed })}>{collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}</button>
      </div>
      <nav className="nav-rail__nav">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = path === href || path.startsWith(match ?? href);
          return (
            <div key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("nav-rail__item", active && "nav-rail__item--active")} title={label}><Icon className="size-4" aria-hidden /><span className="nav-rail__label">{label}</span></Link>
              {href === "/chat" && !collapsed && (
                <div className="nav-rail__threads" data-testid="nav-threads">
                  <button type="button" className="nav-rail__thread nav-rail__thread--new" data-testid="nav-new-chat" onClick={newChat} disabled={bus.isRunning}><Plus className="size-3.5" aria-hidden /> New chat</button>
                  <ul>{threads.slice(0, 12).map((t) => <li key={t.id}><button type="button" className={cn("nav-rail__thread", onChat && bus.selectedId === t.id && "nav-rail__thread--active")} data-testid="nav-thread" onClick={() => select(t.id)} title={t.title}>{t.title}</button></li>)}</ul>
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="nav-rail__foot">{status}</div>
    </aside>
  );
}
