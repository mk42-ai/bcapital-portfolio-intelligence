"use client";
import { useState } from "react";
import { useSettings, clearSettings, DEFAULT_BACKEND } from "@/lib/settings";
import { PLUGINS, MODEL_OPTIONS, EARLIEST_TEST_UTC, DEFAULT_MODEL } from "@/lib/plugins";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";
import { CompanyPicker } from "@/components/chat/company-picker";
import { Countdown } from "@/components/chat/countdown";
export function SettingsForm({ options }: { options: { slug: string; name: string; sector: string }[] }) {
  const [s, set] = useSettings(); const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "err"; msg?: string }>({ state: "idle" }); const [keyErr, setKeyErr] = useState("");
  async function testKey() {
    if (!s.apikey) { setKeyErr("Paste your OnDemand apikey first."); return; }
    setTest({ state: "busy" });
    try {
      const r = await fetch(`/api/ondemand/chat/v1/sessions?externalUserId=${encodeURIComponent(s.externalUserId)}&limit=1`, { headers: { "x-ondemand-key": s.apikey } });
      setTest(r.ok ? { state: "ok", msg: `OK — key accepted (HTTP ${r.status})` } : { state: "err", msg: `HTTP ${r.status}: ${((await r.json().catch(() => ({}))) as { message?: string }).message ?? "rejected"}` });
    } catch (e) { setTest({ state: "err", msg: (e as Error).message }); }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>OnDemand connection</CardTitle><CardDescription>Key is forwarded per request as <code>x-ondemand-key</code> to <code>/api/ondemand/*</code> → <code>api.on-demand.io</code>. Not logged, not persisted server-side.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="OnDemand apikey" htmlFor="set-key" hint="Create one at app.on-demand.io → API Key Management (shown once)." error={keyErr}>
            <Input id="set-key" type="password" autoComplete="off" value={s.apikey} onChange={(e) => { set({ apikey: e.target.value.trim() }); setKeyErr(""); }} aria-invalid={!!keyErr} />
          </Field>
          <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" onClick={testKey} disabled={test.state === "busy"}>{test.state === "busy" ? "Testing…" : "Test connection"}</Button>{test.msg && <span role="status" className={test.state === "ok" ? "text-sm text-primary-soft" : "text-sm text-danger"}>{test.msg}</span>}</div>
          <Field label="externalUserId" htmlFor="set-user" hint="Groups your chat sessions on OnDemand."><Input id="set-user" value={s.externalUserId} onChange={(e) => set({ externalUserId: e.target.value })} /></Field>
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
              <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 text-sm font-medium">{p.name}{p.status === "pending" && <Badge tone="accent">registration pending</Badge>}{p.status === "deferred" && <Badge tone="muted">configuring — deferred</Badge>}</p><p className="text-xs text-muted">{p.purpose}{p.id ? ` · ${p.id}` : " · id: null"}</p>{p.status === "deferred" && <p className="text-xs text-muted">Not callable before <Countdown iso={EARLIEST_TEST_UTC} /> — and never without the owner confirming it is configured.</p>}</div>
              <Switch aria-label={`Enable ${p.name}`} checked={!!p.id && !!s.plugins[p.id]} disabled={!p.id || p.status !== "active"} onCheckedChange={(v) => p.id && set({ plugins: { ...s.plugins, [p.id]: v } })} />
            </li>
          ))}
        </ul></CardContent></Card>
      <Card><CardHeader><CardTitle>Portfolio backend</CardTitle><CardDescription>Read API for companies, news and sentiment. Server pages use <code>PORTFOLIO_API_URL</code>; this override applies to client fetches.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Backend base URL" htmlFor="set-backend" hint={`Default ${DEFAULT_BACKEND} (NEXT_PUBLIC_PORTFOLIO_API_URL). Durable target once provisioned: https://serverless.on-demand.io/apps/bcap-portfolio-intel`}><Input id="set-backend" value={s.backendUrl} onChange={(e) => set({ backendUrl: e.target.value })} /></Field>
          <div><p className="mb-2 text-sm font-medium">Default chat context companies</p><CompanyPicker options={options} value={s.companies} onChange={(v) => set({ companies: v })} /></div>
        </CardContent></Card>
      <Card><CardHeader><CardTitle>Appearance & data</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ThemeToggle />
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { clearSettings(); location.reload(); }}>Reset all local settings</Button><Button variant="ghost" asChild><a href="/onboarding">Re-run onboarding</a></Button></div>
          <p className="text-xs text-muted">Help is always in this same place (Settings → bottom of every page). Nothing here is sent anywhere except the OnDemand proxy and the portfolio backend.</p>
        </CardContent></Card>
    </div>
  );
}
