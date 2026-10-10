"use client";
import { usePathname } from "next/navigation";
/** Main column: padded, max-width content on every route except /chat, which fills the viewport (full-screen canvas). */
export function MainFrame({ children }: { children: React.ReactNode }) {
  const chat = usePathname().startsWith("/chat");
  return <main id="main" tabIndex={-1} data-route={chat ? "chat" : "page"} className={chat ? "flex min-h-0 w-full flex-1 flex-col" : "mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8"}>{children}</main>;
}
