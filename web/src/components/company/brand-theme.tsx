import { contrast, aaBadge, bestInk, hexToRgb, AA_NON_TEXT } from "@/lib/color";
import type { BrandTokens } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
/** Wraps company content in a scoped theme: company tokens if they pass AA at runtime, otherwise B Capital tokens with an explanation. */
/** Light-only: the page stays white. The company's primary colour is exposed as `--co-accent` ONLY if it clears 3:1 against white
 *  (used for a small accent chip / rule); otherwise the neutral foreground is used. Never a page or card background. */
export function CompanyThemeScope({ tokens, children }: { tokens: BrandTokens; children: React.ReactNode }) {
  const primary = tokens.primary && hexToRgb(tokens.primary) ? tokens.primary : null;
  const ok = primary ? contrast(primary, "#ffffff") >= AA_NON_TEXT : false;
  const style = { "--co-accent": ok && primary ? primary : "#16181b" } as React.CSSProperties;
  return (
    <div style={style} data-accent-source={ok ? "company" : "neutral"}>
      {primary && !ok && <p className="mb-3 text-xs text-muted" role="note">Company primary {primary.toUpperCase()} is {contrast(primary, "#ffffff")}:1 against white (below 3:1) — accent chip shown in neutral instead.</p>}
      {children}
    </div>
  );
}
export function Swatches({ tokens }: { tokens: BrandTokens }) {
  const bg = tokens.background ?? "#ffffff";
  const items = [["Primary", tokens.primary], ["Secondary", tokens.secondary], ...(tokens.secondary_all?.slice(1, 4).map((h, i) => [`Tertiary ${i + 1}`, h] as [string, string]) ?? []), ["Background", tokens.background], ["Text", tokens.text]].filter((x): x is [string, string] => !!x[1]);
  if (!items.length) return <p className="text-sm text-muted">No verified colours in the brand matrix for this company (evidence tier: {tokens.evidence_tier ?? "Missing"}).</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Palette swatches with WCAG contrast" data-hue-audit-ignore="company-brand-data">
      {items.map(([label, hex]) => {
        const vsBg = label === "Background" ? contrast(hex, tokens.text ?? bestInk(hex)) : contrast(hex, bg); const b = aaBadge(vsBg); const ink = bestInk(hex);
        return (
          <li key={label} className="overflow-hidden rounded-lg border border-border">
            <div className="flex h-16 items-end p-2" style={{ background: hex, color: ink }}><span className="font-mono text-xs font-semibold">{hex.toUpperCase()}</span></div>
            <div className="bg-surface px-2 py-2 text-xs"><p className="font-medium">{label}</p><p className="text-muted">{label === "Background" ? "text on bg" : "vs background"}: {vsBg}:1 <Badge tone={b.ok ? "primary" : "danger"} className="ml-1">{b.label}</Badge></p></div>
          </li>
        );
      })}
    </ul>
  );
}
