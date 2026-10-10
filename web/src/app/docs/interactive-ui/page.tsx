import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Gauge, Sparkles, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SYNERGY_MATRIX, type SynergyRow } from "@/lib/synergy-matrix";

export const metadata: Metadata = {
  title: "Why the chat is interactive",
  description: "How OnDemand submit-query v1 SSE frames map to interactive UI elements in the analyst chat: the full event → interactivity synergy matrix.",
};

const CHANNEL_TONE: Record<SynergyRow["channel"], React.ComponentProps<typeof Badge>["tone"]> = {
  message: "default",
  thinking: "info",
  agent: "accent",
  heartbeat: "muted",
  terminal: "solid",
};

const PERFORMANCE_BUDGET = [
  { label: "First client event < 400 ms", detail: "The route streams the first typed event before the upstream planner finishes; the phase line and timer are live inside the first paint budget." },
  { label: "rAF-coalesced deltas", detail: "Fulfillment deltas are buffered and flushed once per animation frame, so a fast token stream never schedules more than one React commit per paint." },
  { label: "Reserved citation / sources space → CLS 0", detail: "The Sources rail and citation chip row reserve their height up front, so incremental citations never shift the reading line." },
  { label: "Favicon preload + monogram fallback", detail: "Plugin favicons are preloaded when suggestedPlugins arrives; a two-letter monogram renders instantly and is swapped without layout shift if the icon fails." },
  { label: "Stop → Send reset on terminal frame", detail: "The composer flips back to Send only on [DONE] / [ERROR]: — never on a socket close — so a disconnect cannot be mistaken for completion." },
];

export default function InteractiveUiDocsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Why the chat is interactive"
        lede="Every interactive element in the analyst chat is driven by a specific frame of the OnDemand submit-query v1 stream. This page is the single map from frame to UI."
        actions={
          <Link href="/chat" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2">
            <MessageSquare className="size-4" aria-hidden /> Open chat
          </Link>
        }
      />

      <section className="mb-6 max-w-3xl space-y-3 text-sm leading-relaxed text-muted sm:text-base" aria-label="How it works">
        <p>
          The chat route calls the OnDemand <strong className="font-medium text-foreground">submit-query v1</strong> endpoint in SSE mode. Each server-sent frame
          (statusLog, thinking, message, agent, heartbeat, terminal) is parsed on the server, normalised into a <em>typed client event</em> and forwarded to the
          browser, where a reducer maps every event type to a concrete interactive element — a plan stepper, a tool card, a citation chip, a clarification form.
          Nothing in the UI is inferred from timing or guessed from text: if a frame did not arrive, the element does not appear.
        </p>
        <p>
          Runs use <strong className="font-medium text-foreground">DeepSeek Flash v4.1</strong> (<code className="rounded bg-surface-2 px-1 py-0.5 text-xs">predefined-deepseek-flash</code>) with
          <code className="ml-1 rounded bg-surface-2 px-1 py-0.5 text-xs">reasoningMode: medium</code>. The Perplexity plugin
          (<code className="rounded bg-surface-2 px-1 py-0.5 text-xs">plugin-1722260873</code>) is pinned on every run; any other plugin is passed explicitly in the request
          and surfaces in the rail as a favicon chip the moment the planner selects it.
        </p>
      </section>

      <Card className="mb-6 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4" aria-hidden style={{ color: "var(--brand-green-ink)" }} /> Synergy matrix</CardTitle>
          <CardDescription>{SYNERGY_MATRIX.length} frames · one row per frame, in the order they typically arrive during a run.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 pt-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm" data-testid="synergy-table">
              <caption className="sr-only">Event to interactivity synergy matrix</caption>
              <thead className="border-y border-border bg-surface-2 text-xs uppercase tracking-wide text-muted-2">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Frame</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Channel</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">UI element</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">When it becomes interactive</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {SYNERGY_MATRIX.map((row, i) => (
                  <tr key={`${row.frame}-${i}`} className="border-b border-border align-top last:border-b-0 odd:bg-surface even:bg-surface/60" data-testid="synergy-row" data-channel={row.channel}>
                    <td className="px-4 py-3 font-mono text-xs leading-relaxed text-foreground">{row.frame}</td>
                    <td className="px-4 py-3"><Badge tone={CHANNEL_TONE[row.channel]}>{row.channel}</Badge></td>
                    <td className="px-4 py-3 leading-relaxed text-foreground">{row.ui}</td>
                    <td className="px-4 py-3 leading-relaxed text-muted">{row.when}</td>
                    <td className="px-4 py-3 leading-relaxed text-muted">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-[#fecaca]" data-testid="honest-failure">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-danger-soft"><AlertTriangle className="size-4" aria-hidden /> Honest failure</CardTitle>
            <CardDescription>A failed tool call looks like a failed tool call.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed text-muted">
            <p>
              When Perplexity returns <code className="rounded bg-[#fef2f2] px-1 py-0.5 text-xs text-danger-soft">Not enough credits</code>, the tool card turns
              <Badge tone="danger" className="mx-1">failed</Badge> and shows the raw <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">execution_failed</code> frame verbatim.
            </p>
            <p>
              No green tick, no silent retry and no substituted plugin: the answer that follows is labelled as produced without that source, so the reader can
              weigh it accordingly.
            </p>
          </CardContent>
        </Card>

        <Card data-testid="performance-budget">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="size-4" aria-hidden style={{ color: "var(--brand-green-ink)" }} /> Performance budget</CardTitle>
            <CardDescription>Interactivity is only worth it if it is smooth.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm leading-relaxed">
              {PERFORMANCE_BUDGET.map((item) => (
                <li key={item.label} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--brand-green)" }} />
                  <span><span className="font-medium text-foreground">{item.label}</span> <span className="text-muted">— {item.detail}</span></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
