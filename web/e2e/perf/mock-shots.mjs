// Deterministic screenshots of the interactive chat states against the local mock SSE server (see README). Own process; browser closed on every path.
import { chromium } from 'playwright';
import path from 'node:path'; import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:3412'; const out = process.argv[3] || 'proof/perf/mock'; fs.mkdirSync(out, { recursive: true });
const Q = 'Which of my context companies moved most since the last sentiment run, and why?';
const shots = [
  { name: 'chat-plugins-favicons', q: null, waitSel: '[data-testid=plugin-toggle]', settle: 1200 },
  { name: 'chat-step-summary-midstream', q: Q, waitSel: '[data-testid=step-summary]', settle: 250 },
  { name: 'chat-inline-citations-midstream', q: Q, waitSel: '[data-testid=citation-chip]', settle: 700 },
  { name: 'chat-interactive-awaiting-input', q: Q + ' ask me', waitSel: '[data-testid=clarification-form]', settle: 400 },
  { name: 'chat-interactive-creds', q: Q + ' creds', waitSel: '[data-testid=creds-form]', settle: 400 },
];
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 600_000);
try {
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    for (const s of shots) {
      const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 600, hasTouch: vp.w < 600 });
      const page = await ctx.newPage();
      try {
        await page.goto(`${base}/chat?skip=1`, { waitUntil: 'networkidle' });
        if (s.q) { const ta = page.locator('textarea:visible').first(); await ta.click(); await ta.fill(s.q); await page.waitForTimeout(150); await ta.press('Enter'); const sent = await page.locator('.openui-agent-thread-message-user').count().catch(() => 0); if (!sent) { await page.locator('button.openui-agent-thread-composer__submit-button').click().catch(() => {}); } }
        await page.locator(s.waitSel).first().waitFor({ state: 'attached', timeout: 60_000 });
        await page.waitForTimeout(s.settle);
        const info = await page.evaluate(() => ({ cards: [...document.querySelectorAll('[data-testid=plugin-activity]')].map((e) => e.dataset.plugin + ':' + e.dataset.state), summaries: [...document.querySelectorAll('[data-testid=step-summary]')].map((e) => e.dataset.state), chips: document.querySelectorAll('[data-testid=citation-chip]').length, rail: document.querySelector('[data-testid=sources-rail]')?.dataset.count ?? null, prompt: document.querySelector('[data-testid=clarification-form],[data-testid=creds-form]')?.getAttribute('data-testid') ?? null, favicons: document.querySelectorAll('[data-testid=plugin-favicon]').length, submit: document.querySelector('button.openui-agent-thread-composer__submit-button')?.getAttribute('aria-label') }));
        const file = path.join(out, `${s.name}-${vp.w}.png`); await page.screenshot({ path: file, fullPage: false });
        console.log(JSON.stringify({ shot: file, ...info }));
      } catch (e) { console.log(JSON.stringify({ shot: s.name, vp: vp.w, error: String(e).slice(0, 200) })); }
      await ctx.close();
    }
  }
} finally { clearTimeout(hard); await b.close(); }
