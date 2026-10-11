import type { Metadata } from "next";
import { Suspense } from "react";
import { getAllNews, listCompanies } from "@/lib/api";
import { PageHeader } from "@/components/shell/page-header";
import { NewsFeed } from "@/components/news/news-feed";
import { Skeleton } from "@/components/ui/skeleton";
export const metadata: Metadata = { title: "News Pulse" };
export const revalidate = 120;
export default async function NewsPage() {
  const [news, cs] = await Promise.all([getAllNews(), listCompanies()]);
  const companies = cs.data.filter((c) => c.b_capital_role !== "firm").map((c) => ({ slug: c.slug, name: c.name, sector: c.sector, score: c.sentiment.score, delta: c.sentiment.delta ?? null }));
  return (
    <>
      <PageHeader title="News Pulse" lede={`${news.total.toLocaleString("en-US")} items · ${Object.keys(news.perCompany).length} companies · daily 06:00 UTC`} sources={[{ name: "companies", source: cs.source }, { name: "news total", source: news.summarySource }, { name: news.failedCompanies.length ? `news lists of ${news.failedCompanies.length} companies` : "news lists", source: news.failedCompanies.length || news.liveCompanies === 0 ? "snapshot" : "live" }]} fetchedAt={news.fetched_at} />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}><NewsFeed items={news.data} companies={companies} /></Suspense>
    </>
  );
}
