"use client";
/**
 * Global navigation rail: 224 px expanded, 64 px icon rail collapsed (title tooltips), state persisted in localStorage (ui-store
 * `navCollapsed`). Items: Overview / Companies / News Pulse / Chat / Settings, the "live backend" pill in the foot, and the thread list
 * (New chat + up to 12 threads) NESTED under Chat. On /chat the list reads the thread bus (selection switches in place); elsewhere it
 * reads localStorage and navigates to /chat?thread=<id>. Replaces the old <aside>/Nav and OpenUI's thread sidebar column.
 *
 * Hydration: the SSR render is always expanded (ui-store server snapshot). Until mount the rail carries `nav-rail--pending`, which
 * hides the labels (visibility:hidden) and disables the width transition, so applying the persisted collapsed state after mount
 * does not produce a visible jump or a React #418 mismatch.
 * Mobile (<1024 px): a top bar with icons only + a New chat icon; threads and the collapse toggle are hidden.
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
const MAX_THREADS = 12;

export function NavRail({ status }: { status: ReactNode }) {
  const path = usePathname() ?? "/"; const router = useRouter(); const ui = useUi(); const bus = useThreadBus();
  const [mounted, setMounted] = useState(false); useEffect(() => { setMounted(true); }, []);
  const collapsed = mounted && ui.navCollapsed;
  const onChat = path.startsWith("/chat");
  // Off /chat the bus is unmounted: fall back to the persisted list (read after mount only — localStorage is client-only).
  const [stored, setStored] = useState<BusThread[]>([]);
  useEffect(() => { if (!mounted || bus.mounted) return; setStored(readStoredThreads()); }, [mounted, bus.mounted, path]);
  const threads: BusThread[] = (bus.mounted ? bus.threads : stored).slice(0, MAX_THREADS);
  const select = (id: string) => { if (bus.mounted) bus.select(id); else router.push(`/chat?thread=${encodeURIComponent(id)}`); };
  const newChat = () => { if (bus.mounted) bus.newChat(); else router.push("/chat"); };
  const toggle = () => setUi({ navCollapsed: !ui.navCollapsed });
  return (
    <aside className={cn("nav-rail", !mounted && "nav-rail--pending", collapsed && "nav-rail--collapsed")} data-testid="nav-rail" data-collapsed={collapsed ? "true" : "false"} aria-label="Primary">
      <div className="nav-rail__head">
        <Link href="/overview" className="nav-rail__brand" aria-label="B Capital — home" title="B Capital"><BrandLogo height={24} /></Link>
        <button type="button" className="nav-rail__toggle" data-testid="nav-toggle" aria-expanded={!collapsed} aria-controls="nav-rail-nav" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand" : "Collapse"} onClick={toggle}>
          {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
        </button>
      </div>
      <nav id="nav-rail-nav" className="nav-rail__nav" aria-label="Sections">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = path === href || path.startsWith(match ?? href);
          const isChat = href === "/chat";
          return (
            <div key={href} className="nav-rail__group">
              <Link href={href} aria-current={active ? "page" : undefined} aria-expanded={isChat ? !collapsed : undefined} aria-controls={isChat ? "nav-rail-threads" : undefined} className={cn("nav-rail__item", active && "nav-rail__item--active")} title={label} data-testid={`nav-item-${href.slice(1)}`}>
                <Icon className="size-4 shrink-0" aria-hidden /><span className="nav-rail__label">{label}</span>
              </Link>
              {isChat && !collapsed && (
                <div id="nav-rail-threads" className="nav-rail__threads" data-testid="nav-threads" aria-label="Chat threads">
                  <button type="button" className="nav-rail__thread nav-rail__thread--new" data-testid="nav-new-chat" onClick={newChat} disabled={bus.isRunning} title="New chat"><Plus className="size-3.5 shrink-0" aria-hidden /><span>New chat</span></button>
                  {threads.length > 0 && (
                    <ul>
                      {threads.map((t) => {
                        const current = onChat && bus.selectedId === t.id;
                        return (
                          <li key={t.id}>
                            <button type="button" className={cn("nav-rail__thread", current && "nav-rail__thread--active")} data-testid="nav-thread" data-thread-id={t.id} aria-current={current ? "true" : undefined} onClick={() => select(t.id)} title={t.title}><span className="nav-rail__thread-title">{t.title}</span></button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* Mobile top bar only (<1024 px): New chat as an icon; hidden on desktop where the nested list is shown. */}
        <button type="button" className="nav-rail__item nav-rail__new-mobile" data-testid="nav-new-chat-mobile" onClick={newChat} disabled={bus.isRunning} title="New chat" aria-label="New chat"><Plus className="size-4 shrink-0" aria-hidden /></button>
      </nav>
      <div className="nav-rail__foot">{status}</div>
    </aside>
  );
}
