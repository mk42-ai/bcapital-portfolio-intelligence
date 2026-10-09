import { Inbox, FolderOpen, WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
const ICONS: Record<"news" | "picker" | "error", LucideIcon> = { news: Inbox, picker: FolderOpen, error: WifiOff };
export function EmptyState({ kind, title, body, action, className }: { kind: keyof typeof ICONS; title: string; body?: string; action?: React.ReactNode; className?: string }) {
  const Icon = ICONS[kind];
  return (
    <div role="status" className={cn("card flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-full border border-border bg-surface-2 text-muted" aria-hidden><Icon className="size-6" strokeWidth={1.75} /></span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}
