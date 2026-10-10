import type { Page, Request } from "@playwright/test";

/**
 * Network log fixture: attach BEFORE `page.goto` so every request from navigation start is captured (document, RSC, fetch/XHR, images…).
 * Used by pitchbook-nofetch.spec.ts to prove the PitchBook record is rendered from server HTML with ZERO client fetches.
 */
export type LoggedRequest = { url: string; method: string; resourceType: string; at: number };

/** Any URL that would hit the PitchBook data path: the same-origin proxy `/api/pitchbook/<slug>` or the backend `/pitchbook/<slug>`. */
export const PITCHBOOK_URL = [/\/api\/pitchbook\//i, /\/pitchbook\//i];

export class NetworkLog {
  readonly requests: LoggedRequest[] = [];
  private readonly t0 = Date.now();
  private readonly onRequest = (r: Request) => { this.requests.push({ url: r.url(), method: r.method(), resourceType: r.resourceType(), at: Date.now() - this.t0 }); };

  constructor(private readonly page: Page) { page.on("request", this.onRequest); }

  /** Stop recording (safe to call twice). */
  detach() { this.page.off("request", this.onRequest); }

  /** Requests whose URL matches ANY of the patterns. */
  matching(patterns: RegExp[] = PITCHBOOK_URL): LoggedRequest[] { return this.requests.filter((r) => patterns.some((re) => re.test(r.url))); }

  /** PitchBook data requests only (proxy or backend). */
  pitchbook(): LoggedRequest[] { return this.matching(PITCHBOOK_URL); }

  /** Compact description for assertion messages / annotations. */
  describe(list: LoggedRequest[] = this.pitchbook()): string { return list.map((r) => `${r.method} ${r.url} (${r.resourceType} @${r.at}ms)`).join(" | ") || "none"; }

  /** Best-effort wait for network idle; long-lived streams (SSE/prewarm) on /chat must not fail the test, so the timeout is swallowed. */
  async settle(timeout = 20_000) { await this.page.waitForLoadState("networkidle", { timeout }).catch(() => undefined); }
}

/** Create a log for the page. Call before `page.goto`. */
export function attachNetworkLog(page: Page) { return new NetworkLog(page); }
