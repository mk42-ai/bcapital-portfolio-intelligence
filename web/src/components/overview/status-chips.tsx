import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { StatusChip } from "@/lib/status";
export function StatusChips({ items }: { items: { chip: StatusChip; name: string; slug: string | null }[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Portfolio status events">
      {items.map(({ chip, name, slug }, i) => {
        const body = <Badge tone={chip.tone} className="min-h-7 px-3 text-[13px]"><span className="font-semibold">{name}</span><span aria-hidden>·</span>{chip.label}{chip.date && <time dateTime={chip.date} className="text-muted">{chip.date}</time>}</Badge>;
        return <li key={i}>{slug ? <Link href={`/company/${slug}`} className="rounded-full focus-visible:outline-3 focus-visible:outline-ring">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}
