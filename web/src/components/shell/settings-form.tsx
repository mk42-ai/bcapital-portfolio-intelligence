"use client";
import { useState } from "react";
import { useSettings, clearSettings, DEFAULT_BACKEND } from "@/lib/settings";
import { PLUGINS, MODEL_OPTIONS, EARLIEST_TEST_UTC, DEFAULT_MODEL } from "@/lib/plugins";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompanyPicker } from "@/components/chat/company-picker";
import { Countdown } from "@/components/chat/countdown";
import { BrandLogo } from "@/components/brand/logo";
export function SettingsForm({ options }: { options: { slug: string; name: string; sector: string; logo_url?: string | null }[] }) {
  const [s, set] = useSettings(); const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "err"; msg?: string }>({ state: "idle" }); const [keyErr, setKeyErr] = useState("");
  const [userErr, setUserErr] = useState(""); const [urlErr, setUrlErr] = useState("");
  /** externalUserId must be non-empty (whitespace-only rejected); the value is still echoed in the input so the user can fix it, but only valid values are persisted. */
  function onUser(v: string) { const t = v.trim(); if (!t) { setUserErr("externalUserId is required — enter a non-empty id (used to group your chat sessions)."); return; } setUserErr(""); set({ externalUserId: t }); }
  /** Backend URL must be an absolute https:// URL (http://localhost allowed for local dev); invalid values are shown but not persisted. */
  function onBackend(v: string) {
    const t = v.trim(); let ok = false; try { const u = new URL(t); ok = u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)); } catch { ok = false; }
    if (!ok) { setUrlErr("Enter a valid absolute https:// URL (e.g. https://sb-1gek6bq0m1au.vercel.run). http:// is only allowed for localhost."); return; }
    setUrlErr(""); set({ backendUrl: t.replace(/\/+$/, "") });
  }
  async function testKey() {
    setTest({ state: "busy" });
    try {
      const r = await fetch(`/api/ondemand/chat/v1/sessions?externalUserId=${encodeURIComponent(s.externalUserId)}&limit=1`, { headers: s.apikey ? { "x-ondemand-key": s.apikey } : {} });
      setTest(r.ok ? { state: "ok", msg: `OK — key accepted (HTTP ${r.status})` } : { state: "err", msg: `HTTP ${r.status}: ${((await r.json().catch(() => ({}))) as { message?: string }).message ?? "rejected"}` });
    } catch (e) { setTest({ state: "err", msg: (e as Error).message }); }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2"><BrandLogo height={28} /><p className="text-xs uppercase tracking-[0.14em] text-muted">Portfolio Intelligence · Workspace settings</p></div>
      <Card><CardHeader><CardTitle>OnDemand connection</CardTitle><CardDescription>The server proxy <code>/api/ondemand/*</code> authenticates to <code>api.on-demand.io</code> with <code>ONDEMAND_API_KEY</code> (server env only). A pasted key is forwarded as <code>x-ondemand-key</code> and takes precedence. Nothing is logged.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="OnDemand apikey (optional override)" htmlFor="set-key" hint="Chat already works with the server-side key. Paste your own key only if you want requests billed to your account; it stays in this browser." error={keyErr}>
            <Input id="set-key" type="password" autoComplete="off" value={s.apikey} onChange={(e) => { set({ apikey: e.target.value.trim() }); setKeyErr(""); }} aria-invalid={!!keyErr} />
          </Field>
          <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" onClick={testKey} disabled={test.state === "busy"}>{test.state === "busy" ? "Testing…" : "Test connection"}</Button>{test.msg && <span role="status" className={test.state === "ok" ? "text-sm text-primary-soft" : "text-sm text-danger"}>{test.msg}</span>}</div>
          <Field label="externalUserId" htmlFor="set-user" hint="Groups your chat sessions on OnDemand." error={userErr}><Input id="set-user" defaultValue={s.externalUserId} onChange={(e) => onUser(e.target.value)} onBlur={(e) => { if (!e.target.value.trim()) { e.target.value = s.externalUserId; setUserErr(""); } }} aria-invalid={!!userErr} aria-describedby={userErr ? "set-user-error" : "set-user-hint"} /></Field>
          <Field label="Model endpointId" htmlFor="set-model" hint={`Default ${DEFAULT_MODEL} (Fable 5.1) — the same model used by the daily workflows.`}>
            <Select id="set-model" value={MODEL_OPTIONS.includes(s.model) ? s.model : "custom"} onChange={(e) => { if (e.target.value !== "custom") set({ model: e.target.value }); }}>
              {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}{m === DEFAULT_MODEL ? " (Fable 5.1, default)" : ""}</option>)}<option value="custom">custom…</option>
            </Select>
          </Field>
          <Field label="Custom endpointId" htmlFor="set-model-custom"><Input id="set-model-custom" value={s.model} onChange={(e) => set({ model: e.target.value })} /></Field>
        </CardContent></Card>
      <Card><CardHeader><CardTitle>Plugins (agents) used in chat</CardTitle><CardDescription>Toggled plugins are sent as <code>pluginIds</code> on each query (max 20).</CardDescription></CardHeader>
        <CardContent><ul className="divide-y divide-border">
          {PLUGINS.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 text-sm font-medium">{p.name}{p.status === "builtin" && <Badge tone="muted">built-in context</Badge>}{p.status === "deferred" && <Badge tone="muted">configuring — deferred</Badge>}{p.status === "dropped" && <Badge tone="muted">dropped — tool 404</Badge>}</p><p className="text-xs text-muted">{p.purpose}{p.id ? ` · ${p.id}` : p.status === "builtin" ? "" : " · id: null"}</p>{p.status === "builtin" && <p className="text-xs text-muted" title="The OnDemand public API has no plugin-registration endpoint (docs/categories lists chat, media, workflow, project and MQTT endpoints only), so the portfolio API cannot be attached as a pluginId. Live backend data is injected as systemContext instead. See docs/ONDEMAND_SURFACE.md.">Always on — the OnDemand API has no public plugin-registration endpoint, so the live backend&apos;s sentiment, status and headlines are injected into each thread instead (<a className="underline" href="https://github.com/mk42-ai/bcapital-portfolio-intelligence/blob/main/docs/ONDEMAND_SURFACE.md" target="_blank" rel="noreferrer">docs/ONDEMAND_SURFACE.md</a>).</p>}{p.status === "deferred" && <p className="text-xs text-muted">Not callable before <Countdown iso={EARLIEST_TEST_UTC} /> — and never without the owner confirming it is configured.</p>}</div>
              {p.status !== "builtin" && <Switch aria-label={`Enable ${p.name}`} checked={!!p.id && !!s.plugins[p.id]} disabled={!p.id || p.status !== "active"} onCheckedChange={(v) => p.id && set({ plugins: { ...s.plugins, [p.id]: v } })} />}
            </li>
          ))}
        </ul></CardContent></Card>
      <Card><CardHeader><CardTitle>Portfolio backend</CardTitle><CardDescription>Read API for companies, news and sentiment. Server pages use <code>PORTFOLIO_API_URL</code>; this override applies to client fetches.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Backend base URL" htmlFor="set-backend" hint={`Default ${DEFAULT_BACKEND} (NEXT_PUBLIC_PORTFOLIO_API_URL). Durable target once provisioned: https://serverless.on-demand.io/apps/bcap-portfolio-intel`} error={urlErr}><Input id="set-backend" defaultValue={s.backendUrl} onChange={(e) => onBackend(e.target.value)} aria-invalid={!!urlErr} aria-describedby={urlErr ? "set-backend-error" : "set-backend-hint"} inputMode="url" /></Field>
          <div><p className="mb-2 text-sm font-medium">Default chat context companies</p><CompanyPicker options={options} value={s.companies} onChange={(v) => set({ companies: v })} /></div>
        </CardContent></Card>
      <Card><CardHeader><CardTitle>Local data</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { clearSettings(); location.reload(); }}>Reset all local settings</Button><Button variant="ghost" asChild><a href="/onboarding">Re-run onboarding</a></Button></div>
          <p className="text-xs text-muted">Help is always in this same place (Settings → bottom of every page). Nothing here is sent anywhere except the OnDemand proxy and the portfolio backend.</p>
        </CardContent></Card>
    </div>
  );
}
