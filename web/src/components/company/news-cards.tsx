import { ExternalLink } from "lucide-react";
import type { NewsItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { NewsThumb } from "./news-thumb";
const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : null; } catch { return null; } };
export function NewsCard({ n, companyName, companyLogo, eager = false }: { n: NewsItem & { company_name?: string; company_logo?: string | null }; companyName?: string; companyLogo?: string | null; eager?: boolean }) {
  const src = n.source ?? host(n.url);
  return (
    <article className="card flex min-w-0 gap-3 p-3">
      <NewsThumb src={n.image_url} companyLogo={companyLogo ?? n.company_logo ?? null} host={host(n.url) ?? (n.source && /\./.test(n.source) ? n.source : null)} eager={eager} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><Badge tone={n.kind === "status_change" ? "info" : "muted"}>{n.kind}</Badge>{(companyName ?? n.company_name) && <span className="font-medium text-foreground">{companyName ?? n.company_name}</span>}<time dateTime={n.published_at ?? undefined}>{fmtDate(n.published_at)}</time></p>
        <p className="mt-1 break-words font-semibold text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" className="break-words underline-offset-2 hover:underline">{n.title}<ExternalLink className="ml-1 inline size-3" aria-hidden /><span className="sr-only"> (opens in new tab)</span></a> : n.title}</p>
        {n.summary && <p className="mt-1 line-clamp-3 text-xs text-muted">{n.summary}</p>}
        {src && <p className="mt-1 text-xs"><Badge tone="default">source · {src}</Badge></p>}
      </div>
    </article>
  );
}
