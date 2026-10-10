/**
 * PitchBook freshness stamp (Agent 8): "PitchBook · synced <date> · weekly" with the synced-badge asset (/assets/synced-badge-256.webp).
 * Server-safe (no hooks): the date is formatted deterministically in UTC so SSR and hydration agree. SKELETON — Agent 8 finalises styles.
 */
import { ASSET } from "@/lib/assets";
export function SyncedBadge({ syncedAt, cadence = "weekly", compact }: { syncedAt: string | null | undefined; cadence?: string; compact?: boolean }) {
  const d = syncedAt ? new Date(syncedAt) : null; const ok = d && !isNaN(+d);
  const date = ok ? d!.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
  return (
    <p className={`synced-badge${compact ? " synced-badge--compact" : ""}`} data-testid="pb-synced" data-synced-at={syncedAt ?? ""} aria-label={`PitchBook synced ${date}, ${cadence}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ASSET.syncedBadge} alt="" width={compact ? 16 : 20} height={compact ? 16 : 20} decoding="async" />
      <span>PitchBook · synced <time dateTime={syncedAt ?? undefined}>{date}</time> · {cadence}</span>
    </p>
  );
}
