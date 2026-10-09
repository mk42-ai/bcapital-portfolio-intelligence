"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSettings } from "@/lib/settings";
import { DEFAULT_FOCUS } from "@/lib/plugins";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { CompanyPicker } from "@/components/chat/company-picker";
const GROWTH = [["G", "Generosity"], ["R", "Resilience"], ["O", "Open-mindedness"], ["W", "Will"], ["T", "Teamwork"], ["H", "Humility"]];
export function OnboardingForm({ options }: { options: { slug: string; name: string; sector: string }[] }) {
  const [s, set] = useSettings(); const router = useRouter();
  const [key, setKey] = useState(s.apikey); const [picked, setPicked] = useState<string[]>(s.companies?.length ? s.companies : DEFAULT_FOCUS); const [err, setErr] = useState("");
  function finish(skipKey = false) {
    if (!skipKey && key && key.trim().length < 16) { setErr("That doesn't look like an OnDemand apikey (expected ≥16 characters). Paste the key from app.on-demand.io → API Key Management, or skip for now."); return; }
    set({ apikey: skipKey ? s.apikey : key.trim(), companies: picked.length ? picked : DEFAULT_FOCUS, onboarded: true }); router.replace("/overview");
  }
  return (
    <section className="relative -m-4 min-h-[calc(100dvh-4rem)] overflow-hidden sm:-m-6 lg:-m-8">
      <Image src="/brand/onboarding-bg-1600.webp" alt="" fill priority sizes="100vw" className="object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:px-8 lg:py-16">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary-soft">Welcome to Portfolio Intelligence</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">We empower entrepreneurs to think bigger. <span className="text-primary">Scale faster.</span> <span className="text-accent-soft">Grow global.</span></h1>
          <p className="mt-4 max-w-xl text-base text-muted">Catalysts. Questioners. Visionaries. — one workspace for 135 portfolio companies: brand systems, daily news pulse, sentiment scored by Fable 5.1, and an analyst chat grounded in the portfolio database.</p>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="GROWTH values">
            {GROWTH.map(([l, v]) => <li key={v} className="card flex items-center gap-3 px-3 py-2.5"><span className="grid size-8 place-items-center rounded-md bg-primary font-display text-base font-bold text-primary-foreground">{l}</span><span className="text-sm font-medium">{v}</span></li>)}
          </ul>
        </div>
        <form className="card space-y-5 p-6" onSubmit={(e) => { e.preventDefault(); finish(); }} aria-labelledby="ob-title">
          <h2 id="ob-title" className="font-display text-2xl font-semibold">Set up your workspace</h2>
          <Field label="OnDemand apikey" htmlFor="ob-key" hint="Stored only in this browser's localStorage and sent as x-ondemand-key to our proxy. Never stored on a server." error={err}>
            <Input id="ob-key" type="password" autoComplete="off" value={key} onChange={(e) => { setKey(e.target.value); setErr(""); }} placeholder="paste apikey (optional for browsing, required for chat)" aria-invalid={!!err} aria-describedby={err ? "ob-key-error" : "ob-key-hint"} />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium">Pick 1–5 companies for chat context</p>
            <CompanyPicker options={options} value={picked} onChange={setPicked} max={5} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg">Enter workspace</Button>
            <Button type="button" variant="outline" size="lg" onClick={() => finish(true)}>Skip key for now</Button>
          </div>
        </form>
      </div>
    </section>
  );
}
