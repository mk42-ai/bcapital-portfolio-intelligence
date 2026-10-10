"use client";
/**
 * require_creds card (Agent 12). Credentials are POSTed to the server route /api/chat/creds ONLY (→ OnDemand tool-credentials); never kept in
 * React state after submit, never written to storage, never logged. Illustration: /assets/require-creds-256.webp (local, transparent).
 */
import { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { pluginName as catalogueName } from "@/lib/plugin-catalogue";
import type { Prompt } from "../stream-store";

type CredsPrompt = Extract<Prompt, { kind: "require_creds" }>;
export function RequireCredsCard({ prompt, sessionId }: { prompt: CredsPrompt; sessionId: string | null }) {
  const [vals, setVals] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [done, setDone] = useState<string | null>(null);
  if (done) return <div className="oiu-prompt oiu-prompt--done" data-testid="prompt-done"><Check className="size-4" aria-hidden /> {done}</div>;
    const submit = async (cancelled: boolean) => {
      setBusy(true);
      try {
        const r = await fetch("/api/chat/creds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, pluginId: prompt.pluginId, cancelled, fields: cancelled ? [] : prompt.fields.map((f) => ({ key: f.key, value: vals[f.key] ?? "" })) }) });
        setDone(r.ok ? (cancelled ? "Credential request cancelled." : "Credentials sent to the agent (never stored in the browser).") : `Could not send credentials (HTTP ${r.status}).`);
      } catch (e) { setDone(`Could not send credentials: ${(e as Error).message}`); } finally { setBusy(false); setVals({}); }
    };
    return (
      <form className="oiu-prompt oiu-prompt--creds" data-testid="creds-form" onSubmit={(e) => { e.preventDefault(); void submit(false); }}>
        <p className="oiu-prompt__title"><KeyRound className="size-4" aria-hidden /> {prompt.service || catalogueName(prompt.pluginId ?? "")} needs a credential to continue</p>
        {prompt.fields.map((f) => <label key={f.key} className="oiu-prompt__field"><span>{f.label ?? f.key}</span><input type={f.type === "password" || /secret|token|key|password/i.test(f.key) ? "password" : "text"} autoComplete="off" value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} required /></label>)}
        <div className="oiu-prompt__actions"><button type="submit" className="oiu-prompt__btn oiu-prompt__btn--primary" disabled={busy}>Send securely</button><button type="button" className="oiu-prompt__btn" disabled={busy} onClick={() => void submit(true)}>Cancel</button></div>
        <p className="oiu-prompt__hint">Posted server-side to OnDemand's tool-credentials route; the value is never logged or persisted here.</p>
      </form>
    );
}
