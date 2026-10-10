"use client";
/**
 * require_creds card (Agent 12). Credential values live only in transient React state and are POSTed ONCE to the server route
 * /api/chat/creds (→ OnDemand `/chat/v1/client/sessions/{sid}/messages/{mid}/tool-credentials`). They are cleared from state the moment
 * the request is issued, never written to localStorage/sessionStorage, never logged. Illustration: ASSET.requireCreds (local, transparent).
 */
import { useState } from "react";
import { Check } from "lucide-react";
import { ASSET } from "@/lib/assets";
import { pluginName as catalogueName } from "@/lib/plugin-catalogue";
import type { Prompt } from "../stream-store";
import "./cards.css";

type CredsPrompt = Extract<Prompt, { kind: "require_creds" }>;
const SECRET_RE = /secret|token|key|password/i;
const inputType = (f: CredsPrompt["fields"][number]) => (f.type === "password" || SECRET_RE.test(f.key) || SECRET_RE.test(f.label ?? "") ? "password" : "text");

export function RequireCredsCard({ prompt, sessionId }: { prompt: CredsPrompt; sessionId: string | null }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const service = prompt.service || catalogueName(prompt.pluginId ?? "") || "This plugin";

  if (done) {
    return (
      <div className="oiu-prompt oiu-prompt--done oiu-card--creds-done" data-testid="prompt-done">
        <Check className="size-4" aria-hidden /> {done}
      </div>
    );
  }

  const submit = async (cancelled: boolean) => {
    if (busy) return;
    setBusy(true);
    // Serialise once, then drop the values from state immediately — nothing credential-shaped outlives the request.
    const body = JSON.stringify({
      sessionId,
      pluginId: prompt.pluginId,
      cancelled,
      fields: cancelled ? [] : prompt.fields.map((f) => ({ key: f.key, value: vals[f.key] ?? "" })),
    });
    setVals({});
    try {
      const r = await fetch("/api/chat/creds", { method: "POST", headers: { "content-type": "application/json" }, body, cache: "no-store" });
      setDone(r.ok ? (cancelled ? "Credential request cancelled." : `Credential sent securely to ${service}.`) : `Could not send the credential (HTTP ${r.status}). Nothing was stored.`);
    } catch {
      setDone("Could not reach the credential relay. Nothing was stored.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="oiu-card oiu-card--creds" data-testid="card-require-creds" aria-label="Credential required">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oiu-card--creds__art" src={ASSET.requireCreds} alt="" width={72} height={72} loading="lazy" decoding="async" data-testid="card-require-creds-art" />
      <form className="oiu-prompt oiu-prompt--creds oiu-card--creds__form" data-testid="creds-form" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void submit(false); }}>
        <h3 className="oiu-card--creds__title">{service} needs a credential to continue</h3>
        {prompt.fields.map((f) => (
          <label key={f.key} className="oiu-card--creds__field">
            <span>{f.label ?? f.key}</span>
            <input
              name={f.key}
              type={inputType(f)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-testid={`creds-input-${f.key}`}
              value={vals[f.key] ?? ""}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              required
            />
          </label>
        ))}
        <div className="oiu-card--creds__actions">
          <button type="submit" className="oiu-card--creds__btn oiu-card--creds__btn--primary" disabled={busy} data-testid="creds-send">Send securely</button>
          <button type="button" className="oiu-card--creds__btn" disabled={busy} onClick={() => void submit(true)} data-testid="creds-cancel">Cancel</button>
        </div>
        <p className="oiu-card--creds__hint">Sent server-side to OnDemand only. Never stored in this browser.</p>
      </form>
    </section>
  );
}
