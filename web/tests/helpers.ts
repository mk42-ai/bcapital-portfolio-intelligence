import { type Page } from "@playwright/test";
export const SETTINGS_KEY = "bcap.settings.v1";
/** Mark onboarding done (and optionally inject the apikey) before the app boots, so tests land on the real pages. */
export async function primeSettings(page: Page, extra: Record<string, unknown> = {}) {
  const key = process.env.ONDEMAND_API_KEY ?? process.env.ON_DEMAND_API_KEY ?? "";
  await page.addInitScript(([k, v]) => { localStorage.setItem(k as string, JSON.stringify(v)); }, [SETTINGS_KEY, { onboarded: true, apikey: key, externalUserId: "INV-001", model: "predefined-claude-fable-5.1", theme: "dark", companies: ["perplexity-ai", "apptronik", "fervo-energy", "flutterwave", "writer"], ...extra }]);
}
export const hasKey = () => !!(process.env.ONDEMAND_API_KEY ?? process.env.ON_DEMAND_API_KEY);

/** Attach console/page error capture to a test so client-side exceptions show up in the report. */
export function captureErrors(page: Page, info: { annotations: { type: string; description?: string }[] }) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 300)); });
  return () => { if (errs.length) info.annotations.push({ type: "client-errors", description: errs.slice(0, 10).join(" | ") }); };
}
