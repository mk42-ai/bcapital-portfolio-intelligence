import { ExternalLink, Newspaper } from "lucide-react";
import type { NewsItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : null; } catch { return null; } };
export function NewsCard({ n, companyName }: { n: NewsItem & { company_name?: string }; companyName?: string }) {
  const src = n.source ?? host(n.url);
  return (
    <article className="card flex min-w-0 gap-3 p-3">
      {n.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img data-testid="news-image" src={n.image_url} alt="" width={96} height={96} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-24 shrink-0 rounded-lg border border-border object-cover" />
      ) : (
        <div data-testid="news-image-placeholder" className="grid size-24 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-muted" aria-hidden><Newspaper className="size-6" aria-hidden /></div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><Badge tone={n.kind === "status_change" ? "info" : "muted"}>{n.kind}</Badge>{(companyName ?? n.company_name) && <span className="font-medium text-foreground">{companyName ?? n.company_name}</span>}<time dateTime={n.published_at ?? undefined}>{fmtDate(n.published_at)}</time></p>
        <p className="mt-1 break-words font-semibold text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" className="break-words underline-offset-2 hover:underline">{n.title}<ExternalLink className="ml-1 inline size-3" aria-hidden /><span className="sr-only"> (opens in new tab)</span></a> : n.title}</p>
        {n.summary && <p className="mt-1 line-clamp-3 text-xs text-muted">{n.summary}</p>}
        {(src || n.fetched_at) && <p className="mt-1 flex flex-wrap gap-1 text-xs">{src && <Badge tone="default">source · {src}</Badge>}{n.fetched_at && <Badge tone="muted" title="When the refresh pipeline fetched this item from OnDemand">fetched {n.fetched_at.slice(0, 16).replace("T", " ")}Z</Badge>}</p>}
      </div>
    </article>
  );
}
