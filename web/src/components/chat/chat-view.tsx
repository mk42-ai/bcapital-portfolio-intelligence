"use client";
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { Send, Square, RotateCcw, Plus, History } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { PLUGINS, EARLIEST_TEST_UTC, DEFERRED_PLUGIN_IDS } from "@/lib/plugins";
import { createSession, listMessages, listSessions, mockStream, streamQuery, type ChatMessage, type Status } from "@/lib/ondemand-client";
import { Message } from "./message";
import { CompanyPicker } from "./company-picker";
import { Countdown } from "./countdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { fmtScore } from "@/lib/format";
type CoCtx = { slug: string; name: string; sector: string; status: string; stage: string | null; sentiment: { score: number; label: string; delta?: number | null }; latest_news: { title: string; url: string | null; published_at: string | null }[]; estimated_ticket_size_usd: number | null; estimated_ownership_pct: number | null; b_capital_role: string };
type Thread = { id: string; sessionId: string | null; title: string; createdAt: string; companies: string[]; messages: ChatMessage[] };
const TKEY = "bcap.chat.threads.v1";
const loadThreads = (): Thread[] => { try { return JSON.parse(localStorage.getItem(TKEY) ?? "[]"); } catch { return []; } };
const saveThreads = (t: Thread[]) => { try { localStorage.setItem(TKEY, JSON.stringify(t.slice(0, 30))); } catch {} };
const SUGGESTIONS = ["Which focus companies moved most since the last run, and why?", "Summarise this week's news for Fervo Energy with sources.", "Compare Apptronik and WRITER on funding momentum and sentiment.", "Draft a one-paragraph LP update on the portfolio's sentiment."];

export function ChatView({ companies }: { companies: CoCtx[] }) {
  const [s, set] = useSettings();
  const options = useMemo(() => companies.map((c) => ({ slug: c.slug, name: c.name, sector: c.sector })).sort((a, b) => a.name.localeCompare(b.name)), [companies]);
  const [threads, setThreads] = useState<Thread[]>([]); const [tid, setTid] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("ready"); const [input, setInput] = useState(""); const [err, setErr] = useState("");
  const [remote, setRemote] = useState<{ id: string; title?: string; createdAt: string }[]>([]); const [showHistory, setShowHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null); const listRef = useRef<HTMLDivElement>(null); const liveRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = loadThreads(); setThreads(t); setTid(t[0]?.id ?? null); }, []);
  const thread = threads.find((t) => t.id === tid) ?? null;
  const [optimistic, addOptimistic] = useOptimistic(thread?.messages ?? [], (state: ChatMessage[], m: ChatMessage) => (state.some((x) => x.id === m.id) ? state : [...state, m]));
  const pluginNames = useMemo(() => Object.fromEntries(PLUGINS.filter((p) => p.id).map((p) => [p.id as string, p.name])), []);
  const activePlugins = PLUGINS.filter((p) => p.id && p.status === "active" && s.plugins[p.id] && !DEFERRED_PLUGIN_IDS.has(p.id)).map((p) => p.id as string);
  const ctxCompanies = companies.filter((c) => s.companies.includes(c.slug));
  const upsert = useCallback((t: Thread) => setThreads((prev) => { const next = [t, ...prev.filter((x) => x.id !== t.id)]; saveThreads(next); return next; }), []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "auto" }); }, [optimistic, status]);
  useEffect(() => { if (liveRef.current && status === "ready" && thread?.messages.at(-1)?.role === "assistant") liveRef.current.textContent = "Answer complete."; }, [status, thread]);

  function contextMetadata() {
    return [
      { key: "app", value: "B Capital Portfolio Intelligence — answer as a portfolio analyst; cite URLs inline; use sector label 'Energy & Resilience'." },
      ...ctxCompanies.map((c) => ({ key: `company:${c.slug}`, value: JSON.stringify({ name: c.name, sector: c.sector, status: c.status, stage: c.stage, b_capital_role: c.b_capital_role, est_ticket_usd: c.estimated_ticket_size_usd, est_ownership_pct: c.estimated_ownership_pct, sentiment: c.sentiment, latest_news: c.latest_news.slice(0, 5) }).slice(0, 1800) })),
    ];
  }
  const newThread = () => { const t: Thread = { id: `t-${Date.now()}`, sessionId: null, title: "New conversation", createdAt: new Date().toISOString(), companies: s.companies, messages: [] }; upsert(t); setTid(t.id); setErr(""); };

  async function send(q: string, opts: { regenerate?: boolean } = {}) {
    const text = q.trim(); if (!text || status !== "ready") return;
    setErr(""); let t = thread; if (!t) { t = { id: `t-${Date.now()}`, sessionId: null, title: text.slice(0, 48), createdAt: new Date().toISOString(), companies: s.companies, messages: [] }; setTid(t.id); }
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", parts: [{ type: "text", text }], createdAt: new Date().toISOString() };
    const base = opts.regenerate ? t.messages.slice(0, -1) : [...t.messages, userMsg];
    if (!opts.regenerate) startTransition(() => addOptimistic(userMsg));
    let cur: Thread = { ...t, title: t.title === "New conversation" ? text.slice(0, 48) : t.title, messages: base }; upsert(cur); setInput(""); setStatus("submitted");
    const ctl = new AbortController(); abortRef.current = ctl;
    const onUpdate = (m: ChatMessage) => { setStatus(m.status === "ready" ? "ready" : m.status === "error" ? "error" : m.status ?? "streaming"); const msgs = [...base]; const i = msgs.findIndex((x) => x.id === m.id); if (i >= 0) msgs[i] = m; else msgs.push(m); cur = { ...cur, messages: msgs }; upsert(cur); };
    try {
      if (!s.apikey) { await mockStream({ query: text, signal: ctl.signal, onUpdate, companies: ctxCompanies.map((c) => c.name) }); }
      else {
        let sid = cur.sessionId;
        if (!sid) { sid = await createSession(s.apikey, s.externalUserId, activePlugins, contextMetadata()); cur = { ...cur, sessionId: sid }; upsert(cur); }
        const prefix = cur.messages.filter((m) => m.role === "user").length <= 1 && ctxCompanies.length ? `Context (portfolio DB records, latest news, sentiment): ${ctxCompanies.map((c) => `${c.name} [${c.sector}; ${c.status}; sentiment ${fmtScore(c.sentiment.score)} ${c.sentiment.label}; est. ticket ${c.estimated_ticket_size_usd ?? "n/a"}; news: ${c.latest_news.slice(0, 3).map((n) => n.title).join(" | ")}]`).join("\n")}\n\nQuestion: ` : "";
        await streamQuery({ key: s.apikey, sessionId: sid, query: prefix + text, endpointId: s.model, pluginIds: activePlugins, signal: ctl.signal, onUpdate, pluginNames });
      }
      setStatus("ready");
    } catch (e) { const m = (e as Error).message; setErr(m); setStatus("error"); const last = cur.messages.at(-1); if (last?.role === "assistant") { onUpdate({ ...last, status: "error", error: m }); } setStatus("ready"); }
    finally { abortRef.current = null; }
  }
  const stop = () => abortRef.current?.abort();
  const regenerate = () => { const lastUser = [...(thread?.messages ?? [])].reverse().find((m) => m.role === "user"); if (lastUser) send(lastUser.parts.map((p) => (p.type === "text" ? p.text : "")).join(""), { regenerate: true }); };
  async function loadRemote() { if (!s.apikey) return; try { setRemote(await listSessions(s.apikey, s.externalUserId)); setShowHistory(true); } catch (e) { setErr((e as Error).message); } }
  async function openRemote(id: string) {
    if (!s.apikey) return; try { const ms = await listMessages(s.apikey, id); const msgs: ChatMessage[] = ms.flatMap((m) => [{ id: `u-${m.id}`, role: "user" as const, parts: [{ type: "text" as const, text: m.query }], createdAt: m.createdAt }, { id: `a-${m.id}`, role: "assistant" as const, parts: [{ type: "text" as const, text: m.answer ?? "" }], createdAt: m.createdAt, status: "ready" as const }]); const t: Thread = { id: `t-${id}`, sessionId: id, title: ms[0]?.query?.slice(0, 48) ?? `Session ${id.slice(-6)}`, createdAt: ms[0]?.createdAt ?? new Date().toISOString(), companies: s.companies, messages: msgs }; upsert(t); setTid(t.id); setShowHistory(false); } catch (e) { setErr((e as Error).message); }
  }
  const busy = status === "submitted" || status === "streaming";
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
      <aside className="card flex min-w-0 flex-col p-3 lg:h-[calc(100dvh-10rem)]" aria-label="Conversations">
        <div className="mb-2 flex gap-2"><Button size="sm" onClick={newThread} className="flex-1"><Plus aria-hidden />New</Button><Button size="sm" variant="outline" onClick={loadRemote} disabled={!s.apikey} aria-label="Load OnDemand session history"><History aria-hidden /></Button></div>
        {showHistory && remote.length > 0 && <div className="mb-2 rounded-lg border border-border p-2 text-xs"><p className="mb-1 font-medium">OnDemand sessions ({s.externalUserId})</p><ul className="max-h-40 space-y-1 overflow-auto">{remote.map((r) => <li key={r.id}><button className="w-full truncate rounded px-1 py-1 text-left hover:bg-surface-2" onClick={() => openRemote(r.id)}>{r.title || r.id} · {r.createdAt.slice(0, 10)}</button></li>)}</ul></div>}
        <ul className="min-h-0 flex-1 space-y-1 overflow-auto" role="list">{threads.map((t) => <li key={t.id}><button onClick={() => setTid(t.id)} aria-current={t.id === tid ? "true" : undefined} className={`w-full truncate rounded-md px-2 py-2 text-left text-sm ${t.id === tid ? "bg-primary/15 text-primary-soft" : "hover:bg-surface-2"}`}>{t.title}</button></li>)}{threads.length === 0 && <li className="px-2 text-xs text-muted">No conversations yet.</li>}</ul>
        <p className="mt-2 break-words text-[11px] text-muted [overflow-wrap:anywhere]">Threads persist in localStorage; sessions live on OnDemand under <code>{s.externalUserId}</code>.</p>
      </aside>

      <section className="card flex min-h-[60vh] min-w-0 flex-col lg:h-[calc(100dvh-10rem)]" aria-label="Chat">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted">
          <Badge tone={s.apikey ? "primary" : "accent"}>{s.apikey ? "live · OnDemand" : "mock mode — add apikey in Settings"}</Badge><span>model <code>{s.model}</code></span><span>· plugins {activePlugins.length}</span><span>· context {ctxCompanies.length} companies</span>
          <span className="ml-auto" role="status">{status === "ready" ? "ready" : status === "submitted" ? "submitted…" : status === "streaming" ? "streaming…" : "error"}</span>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {optimistic.length === 0 && (
            <div className="mx-auto max-w-xl py-8 text-center"><h2 className="font-display text-2xl font-semibold">Ask the portfolio</h2><p className="mt-2 text-sm text-muted">Answers stream from OnDemand (Fable 5.1) with Perplexity and GPT Search; your selected companies' DB records, latest news and sentiment are injected as session context.</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">{SUGGESTIONS.map((q) => <li key={q}><button onClick={() => send(q)} className="h-full w-full rounded-lg border border-border bg-surface-2 p-3 text-left text-sm hover:bg-surface-3">{q}</button></li>)}</ul></div>
          )}
          {optimistic.map((m) => <Message key={m.id} m={m} />)}
          <div ref={liveRef} aria-live="polite" className="sr-only" />
        </div>
        {err && <p role="alert" className="mx-4 mb-2 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">{err}{/401|apikey|key/i.test(err) && <> · <Link href="/settings" className="underline">fix in Settings</Link></>}</p>}
        <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea id="chat-input" rows={2} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder="Ask about any portfolio company… (Enter to send, Shift+Enter for newline)" className="min-h-12 flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted-2 focus-visible:outline-3 focus-visible:outline-ring" disabled={busy} />
          {busy ? <Button type="button" variant="danger" onClick={stop} aria-label="Stop generating"><Square aria-hidden />Stop</Button> : <><Button type="button" variant="outline" onClick={regenerate} disabled={!thread?.messages.some((m) => m.role === "assistant")} aria-label="Regenerate last answer"><RotateCcw aria-hidden /></Button><Button type="submit" disabled={!input.trim()}><Send aria-hidden />Send</Button></>}
        </form>
      </section>

      <aside className="min-w-0 space-y-4" aria-label="Context and plugins">
        <Card className="p-4"><h2 className="mb-2 text-sm font-semibold">Company context (1–5)</h2><CompanyPicker compact options={options} value={s.companies} onChange={(v) => set({ companies: v.slice(0, 5) })} max={5} />
          <ul className="mt-2 space-y-1 text-xs text-muted">{ctxCompanies.map((c) => <li key={c.slug} className="flex justify-between"><span>{c.name}</span><span className="tabular-nums">{fmtScore(c.sentiment.score)} · {c.latest_news.length} news</span></li>)}</ul></Card>
        <Card className="p-4"><h2 className="mb-2 text-sm font-semibold">Plugins</h2>
          <ul className="space-y-2">{PLUGINS.map((p) => (
            <li key={p.name} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0"><p className="flex flex-wrap items-center gap-1 font-medium">{p.name}{p.status === "pending" && <Badge tone="accent">registration pending</Badge>}{p.status === "deferred" && <Badge tone="muted">configuring — deferred</Badge>}</p>
                {p.status === "deferred" && <p className="text-[11px] text-muted">available after <Countdown iso={EARLIEST_TEST_UTC} /> once the owner confirms</p>}{p.status === "pending" && <p className="text-[11px] text-muted">portfolio_plugin_id = null</p>}</div>
              <Switch aria-label={`Use ${p.name}`} checked={!!p.id && !!s.plugins[p.id] && p.status === "active"} disabled={!p.id || p.status !== "active"} onCheckedChange={(v) => p.id && set({ plugins: { ...s.plugins, [p.id]: v } })} />
            </li>))}</ul>
        </Card>
      </aside>
    </div>
  );
}
