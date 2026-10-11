"use client";
import { useState } from "react";
import { BrandLogo } from "@/components/brand/logo";
import { useRouter } from "next/navigation";
import { useSettings } from "@/lib/settings";
import { DEFAULT_FOCUS } from "@/lib/plugins";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { CompanyPicker } from "@/components/chat/company-picker";
import { GrowthValues } from "@/components/shell/growth-values";
export function OnboardingForm({ options }: { options: { slug: string; name: string; sector: string; logo_url?: string | null }[] }) {
  const [s, set] = useSettings(); const router = useRouter();
  const [key, setKey] = useState(s.apikey); const [picked, setPicked] = useState<string[]>(s.companies?.length ? s.companies : DEFAULT_FOCUS); const [err, setErr] = useState("");
  function finish(skipKey = false) {
    if (!skipKey && key && key.trim().length < 16) { setErr("Key looks too short (≥16 characters). Copy it from app.on-demand.io → API Key Management, or skip."); return; }
    set({ apikey: skipKey ? s.apikey : key.trim(), companies: picked.length ? picked : DEFAULT_FOCUS, onboarded: true }); router.replace("/overview");
  }
  return (
    <section className="mx-auto max-w-6xl">
      <div className="grid gap-8 py-6 lg:grid-cols-[1.1fr_1fr] lg:py-12">
        <div>
          <div className="flex flex-wrap items-center gap-3"><BrandLogo height={32} /><p className="text-xs uppercase tracking-[0.2em] text-muted">Welcome to Portfolio Intelligence</p></div>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">We empower entrepreneurs to think bigger. Scale faster. Grow global.</h1>
          <p className="mt-4 max-w-xl text-base text-muted">Catalysts. Questioners. Visionaries. — one workspace for 135 portfolio companies: news, sentiment and chat.</p>
          <GrowthValues />
        </div>
        <form className="card space-y-5 p-6" onSubmit={(e) => { e.preventDefault(); finish(); }} aria-labelledby="ob-title">
          <h2 id="ob-title" className="font-display text-2xl font-semibold">Set up your workspace</h2>
          <Field label="OnDemand apikey (optional)" htmlFor="ob-key" hint="Optional. Stays in this browser." error={err}>
            <Input id="ob-key" type="password" autoComplete="off" value={key} onChange={(e) => { setKey(e.target.value); setErr(""); }} placeholder="Leave blank to use the built-in key" aria-invalid={!!err} aria-describedby={err ? "ob-key-error" : "ob-key-hint"} />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium">Chat context (1–5 companies)</p>
            <CompanyPicker options={options} value={picked} onChange={setPicked} max={5} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg">Enter workspace</Button>
            <Button type="button" variant="outline" size="lg" onClick={() => finish(true)}>Skip</Button>
          </div>
        </form>
      </div>
    </section>
  );
}
