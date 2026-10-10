/**
 * synced-badge.test.ts — pure tests for formatSynced (Agent 8). Run with tsx (no framework):
 *   cd web && node ../node_modules/tsx/dist/cli.mjs tests/unit/synced-badge.test.ts
 * Exits non-zero on any failure.
 */
import Module, { createRequire } from "node:module";

// The component imports its own .css (handled by Next's bundler); stub that extension for the plain tsx runner, then load it.
(Module as unknown as { _extensions: Record<string, (m: unknown, f: string) => void> })._extensions[".css"] = () => {};
const req = createRequire(__filename);
const { formatSynced, STALE_AFTER_MS } = req("../../src/components/company/synced-badge") as typeof import("../../src/components/company/synced-badge");

let pass = 0; const failures: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); } else { failures.push(name); console.log(`  FAIL ${name} → ${JSON.stringify({ got, want })}`); }
};

console.log("formatSynced");
// 1. null / undefined / empty / invalid → em dash, never stale
eq("null → —", formatSynced(null), { date: "—", stale: false });
eq("undefined → —", formatSynced(undefined), { date: "—", stale: false });
eq("invalid → —", formatSynced("not-a-date", Date.UTC(2026, 9, 10)), { date: "—", stale: false });

// 2. a date → "d Mon yyyy" in UTC (no leading zero, UTC day even when the local zone would roll over)
eq("date formats d Mon yyyy (UTC)", formatSynced("2026-10-05T06:00:00Z"), { date: "5 Oct 2026", stale: false });
eq("date near midnight stays on the UTC day", formatSynced("2026-01-31T23:30:00Z"), { date: "31 Jan 2026", stale: false });
eq("no `now` → staleness never computed", formatSynced("2020-01-01T00:00:00Z"), { date: "1 Jan 2020", stale: false });

// 3. stale = strictly older than 8 days relative to `now`
const synced = Date.UTC(2026, 9, 5, 6, 0, 0); // 5 Oct 2026 06:00Z
const iso = new Date(synced).toISOString();
eq("7 days old → fresh", formatSynced(iso, synced + 7 * 86_400_000), { date: "5 Oct 2026", stale: false });
eq("exactly 8 days → fresh (boundary)", formatSynced(iso, synced + STALE_AFTER_MS), { date: "5 Oct 2026", stale: false });
eq("8 days + 1 min → stale", formatSynced(iso, synced + STALE_AFTER_MS + 60_000), { date: "5 Oct 2026", stale: true });
eq("stale with Date `now`", formatSynced(iso, new Date(synced + 30 * 86_400_000)), { date: "5 Oct 2026", stale: true });

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.error("Failures:", failures); process.exit(1); }
