/**
 * PitchBook freshness stamp (Agent 8): "PitchBook · synced <d Mon yyyy> · weekly" with the synced-badge asset (ASSET.syncedBadge).
 * Server-safe (no hooks, no Date.now() in render): the date is formatted deterministically in UTC so SSR and hydration agree.
 * Staleness (> 8 days) is only computed when the caller passes `now` — leaving it undefined skips the check (hydration-safe default).
 */
import { ASSET } from "@/lib/assets";
import "./synced-badge.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Staleness threshold: older than 8 days (weekly cadence + 1 day of slack). */
export const STALE_AFTER_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * Pure helper: formats an ISO timestamp as "d Mon yyyy" in UTC (never locale/timezone dependent) and flags staleness.
 * `now` (ms epoch or Date) is optional — when omitted `stale` is always false so server and client render identically.
 */
export function formatSynced(iso: string | null | undefined, now?: number | Date): { date: string; stale: boolean } {
  if (!iso) return { date: "—", stale: false };
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return { date: "—", stale: false };
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const nowMs = now === undefined ? undefined : typeof now === "number" ? now : now.getTime();
  const stale = nowMs !== undefined && !Number.isNaN(nowMs) && nowMs - t > STALE_AFTER_MS;
  return { date, stale };
}

export function SyncedBadge({
  syncedAt,
  cadence = "weekly",
  compact,
  now,
}: {
  syncedAt: string | null | undefined;
  cadence?: string;
  compact?: boolean;
  /** Optional reference time for the staleness dot. Omit on the server / first render to avoid hydration mismatches. */
  now?: number | Date;
}) {
  const { date, stale } = formatSynced(syncedAt, now);
  const px = compact ? 16 : 20;
  return (
    <p
      className={`synced-badge${compact ? " synced-badge--compact" : ""}${stale ? " synced-badge--stale" : ""}`}
      data-testid="pb-synced"
      data-synced-at={syncedAt ?? ""}
      data-stale={stale ? "true" : undefined}
      aria-label={`PitchBook synced ${date}, ${cadence}${stale ? ", may be out of date" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="synced-badge__img" src={ASSET.syncedBadge} alt="" width={px} height={px} decoding="async" loading="lazy" />
      <span className="synced-badge__text">
        PitchBook · <span className="synced-badge__synced">synced</span> <time dateTime={syncedAt ?? undefined}>{date}</time> · {cadence}
      </span>
      {stale ? <span className="synced-badge__dot" aria-hidden="true" title="Older than 8 days" /> : null}
    </p>
  );
}
