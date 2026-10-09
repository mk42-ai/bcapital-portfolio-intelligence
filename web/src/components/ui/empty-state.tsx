import Image from "next/image";
import { cn } from "@/lib/utils";
const ASSETS = { news: "/brand/empty-news-480.webp", picker: "/brand/empty-picker-480.webp", error: "/brand/error-offline-480.webp" } as const;
export function EmptyState({ kind, title, body, action, className }: { kind: keyof typeof ASSETS; title: string; body?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("card flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      <Image src={ASSETS[kind]} alt="" width={160} height={160} className="rounded-xl" priority={false} />
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}
