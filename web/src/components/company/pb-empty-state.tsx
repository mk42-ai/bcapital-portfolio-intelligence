/**
 * Financial empty-state for a PitchBook field the plugin cannot answer (Agent 4).
 * The financial-empty asset (local, ASSET.financialEmpty) + ONE honest line. Server-safe, no hooks.
 * pitchbook-view.tsx (Agent 26) renders <FieldEmptyState> per unavailable field; the chat drawer uses
 * <FieldEmptyStateCompactRow> to list several unavailable fields on one line.
 */
import { ASSET } from "@/lib/assets";
import "./pb-empty-state.css";

/** The only honest default: the sole PitchBook plugin on this account is the Investor Finder (investor search only). */
export const PB_UNAVAILABLE_COPY = "Not available from the PitchBook Investor Finder plugin (investor search only)";

const sep = " · ";

export function FieldEmptyState({ field, note, compact }: { field: string; note?: string; compact?: boolean }) {
  const size = compact ? 32 : 48;
  return (
    <div className={`pb-field-empty${compact ? " pb-field-empty--compact" : ""}`} data-testid="pb-field-empty" data-field={field} role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="pb-field-empty__img" src={ASSET.financialEmpty} alt="" width={size} height={size} decoding="async" loading="lazy" />
      <p className="pb-field-empty__text">{note ?? PB_UNAVAILABLE_COPY}</p>
    </div>
  );
}

/**
 * One-line summary of several unavailable fields, e.g.
 * "Valuation history · Financials · Comparables — not available from the plugin". Renders nothing when `fields` is empty.
 */
export function FieldEmptyStateCompactRow({ fields, note }: { fields: string[]; note?: string }) {
  if (!fields.length) return null;
  return (
    <div className="pb-field-empty pb-field-empty--row" data-testid="pb-field-empty" data-field={fields.join(",")} role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="pb-field-empty__img" src={ASSET.financialEmpty} alt="" width={20} height={20} decoding="async" loading="lazy" />
      <p className="pb-field-empty__text">
        <span className="pb-field-empty__fields">{fields.join(sep)}</span>
        {" — "}
        {note ?? "Not available from the plugin"}
      </p>
    </div>
  );
}
