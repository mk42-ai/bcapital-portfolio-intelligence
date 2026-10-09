import { companyTheme, contrast, aaBadge, bestInk } from "@/lib/color";
import type { BrandTokens } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
/** Wraps company content in a scoped theme: company tokens if they pass AA at runtime, otherwise B Capital tokens with an explanation. */
export function CompanyThemeScope({ tokens, children }: { tokens: BrandTokens; children: React.ReactNode }) {
  const t = companyTheme(tokens);
  const ink = t.text, bg = t.background;
  const style = { "--co-bg": bg, "--co-ink": ink, "--co-primary": t.primary, "--co-accent": t.accent, "--co-font": tokens.fonts?.[0] ? `"${tokens.fonts[0]}", var(--font-body)` : "var(--font-body)" } as React.CSSProperties;
  return (
    <div style={style} data-theme-source={t.source}>
      {t.source !== "company" && (
        <p className="mb-3 text-xs text-muted" role="note">Company palette {t.source === "bcapital" ? "incomplete" : "fails WCAG AA at runtime"} — themed with B Capital tokens instead.{t.checks.length > 0 && <> ({t.checks.map((c) => `${c.pair} ${c.ratio}:1`).join(", ")})</>}</p>
      )}
      {children}
    </div>
  );
}
export function Swatches({ tokens }: { tokens: BrandTokens }) {
  const bg = tokens.background ?? "#0a211a";
  const items = [["Primary", tokens.primary], ["Secondary", tokens.secondary], ...(tokens.secondary_all?.slice(1, 4).map((h, i) => [`Tertiary ${i + 1}`, h] as [string, string]) ?? []), ["Background", tokens.background], ["Text", tokens.text]].filter((x): x is [string, string] => !!x[1]);
  if (!items.length) return <p className="text-sm text-muted">No verified colours in the brand matrix for this company (evidence tier: {tokens.evidence_tier ?? "Missing"}).</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Palette swatches with WCAG contrast">
      {items.map(([label, hex]) => {
        const vsBg = label === "Background" ? contrast(hex, tokens.text ?? bestInk(hex)) : contrast(hex, bg); const b = aaBadge(vsBg); const ink = bestInk(hex);
        return (
          <li key={label} className="overflow-hidden rounded-xl border border-border">
            <div className="flex h-16 items-end p-2" style={{ background: hex, color: ink }}><span className="font-mono text-xs font-semibold">{hex.toUpperCase()}</span></div>
            <div className="bg-surface px-2 py-2 text-xs"><p className="font-medium">{label}</p><p className="text-muted">{label === "Background" ? "text on bg" : "vs background"}: {vsBg}:1 <Badge tone={b.ok ? "primary" : "danger"} className="ml-1">{b.label}</Badge></p></div>
          </li>
        );
      })}
    </ul>
  );
}
