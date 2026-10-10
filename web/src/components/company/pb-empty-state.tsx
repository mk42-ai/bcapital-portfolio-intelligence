/**
 * Financial empty-state for a PitchBook field the plugin cannot answer (Agent 4): the financial-empty asset + ONE honest line.
 * Server-safe, no hooks. SKELETON — Agent 4 finalises copy/sizes/styles (pb-empty-state.css); pitchbook-view.tsx (Agent 26) renders it per unavailable field.
 */
import { ASSET } from "@/lib/assets";
export function FieldEmptyState({ field, note, compact }: { field: string; note?: string; compact?: boolean }) {
  return (
    <div className={`pb-field-empty${compact ? " pb-field-empty--compact" : ""}`} data-testid="pb-field-empty" data-field={field} role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ASSET.financialEmpty} alt="" width={compact ? 32 : 48} height={compact ? 32 : 48} decoding="async" loading="lazy" />
      <p>{note ?? `No ${field.replace(/_/g, " ")} from the PitchBook Investor Finder plugin (investor search only).`}</p>
    </div>
  );
}
