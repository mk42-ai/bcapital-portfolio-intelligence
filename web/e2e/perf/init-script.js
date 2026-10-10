// Injected via context.addInitScript BEFORE navigation. Pure browser code (no imports).
// Buffers perf signals into window.__perf / __raf / __sse / __firstSeen / __scroll for record-run.mjs to read.
(() => {
  if (window.__perfInit) return;
  window.__perfInit = true;
  window.__perf = { layoutShifts: [], longTasks: [], paints: [], events: [] };
  window.__raf = { frames: [] };
  window.__rafOn = false;
  window.__sse = [];
  window.__sseMeta = { requestBody: null, headersAt: null, sendT0: null, responseStatus: null, responseHeaders: null };
  window.__firstSeen = {};
  window.__scroll = [];
  window.__sendT0 = null;

  // (a) PerformanceObserver buffers
  const obs = (type, extra, map) => {
    try {
      const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__perf[map.key].push(map.fn(e)); });
      po.observe({ type, buffered: true, ...extra });
    } catch { /* type unsupported */ }
  };
  obs('layout-shift', {}, { key: 'layoutShifts', fn: (e) => ({ t: e.startTime, value: e.value, hadRecentInput: !!e.hadRecentInput }) });
  obs('longtask', {}, { key: 'longTasks', fn: (e) => ({ t: e.startTime, dur: e.duration }) });
  obs('paint', {}, { key: 'paints', fn: (e) => ({ name: e.name, t: e.startTime }) });
  obs('event', { durationThreshold: 16 }, { key: 'events', fn: (e) => ({ name: e.name, t: e.startTime, dur: e.duration, processingStart: e.processingStart }) });

  // (b) rAF sampler — frame deltas while window.__rafOn
  let last = null;
  const tick = (ts) => {
    if (window.__rafOn) { if (last != null) window.__raf.frames.push(ts - last); last = ts; } else { last = null; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // (c) fetch tap for /api/chat — clone response, split SSE lines
  const origFetch = window.fetch.bind(window);
  const strip = (o) => {
    if (!o || typeof o !== 'object') return o;
    const c = Array.isArray(o) ? [] : {};
    for (const k of Object.keys(o)) {
      if (/apikey|api_key|x-ondemand-key|authorization/i.test(k)) c[k] = '[stripped]';
      else c[k] = strip(o[k]);
    }
    return c;
  };
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/\/api\/chat(\?|$)/.test(url)) return origFetch(input, init);
    const sendT0 = window.__sendT0 ?? performance.now();
    window.__sseMeta.sendT0 = sendT0;
    try { window.__sseMeta.requestBody = strip(JSON.parse(String(init && init.body))); } catch { window.__sseMeta.requestBody = { unparsed: true }; }
    const res = await origFetch(input, init);
    window.__sseMeta.headersAt = performance.now() - sendT0;
    window.__sseMeta.responseStatus = res.status;
    const hdrs = {}; try { res.headers.forEach((v, k) => { hdrs[k] = /key|auth/i.test(k) ? '[stripped]' : v; }); } catch {}
    window.__sseMeta.responseHeaders = hdrs;
    if (!res.body) return res;
    const clone = res.clone();
    (async () => {
      const reader = clone.body.getReader(); const dec = new TextDecoder(); let buf = '';
      const handle = (line) => {
        if (!line.startsWith('data:')) return;
        const raw = line.slice(5).replace(/^ /, '');
        const rec = { tMs: performance.now() - sendT0, isoUtc: new Date().toISOString(), raw, parsed: null, type: null, name: null, eventType: null, statusType: null };
        if (raw.trim() === '[DONE]') rec.type = '[DONE]';
        else {
          try {
            const p = JSON.parse(raw); rec.parsed = p; rec.type = p.type ?? p.eventType ?? null; rec.name = p.name ?? null;
            const v = p.value && typeof p.value === 'object' ? p.value : (p.value && typeof p.value === 'string' ? (() => { try { return JSON.parse(p.value); } catch { return null; } })() : null);
            if (v) { rec.eventType = v.eventType ?? v.type ?? null; rec.statusType = v.statusType ?? v.status ?? null; rec.valueParsed = v; }
            if (!rec.eventType && p.eventType) rec.eventType = p.eventType;
          } catch { rec.type = 'unparsed'; }
        }
        window.__sse.push(rec);
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split(/\r?\n/); buf = lines.pop() ?? '';
          for (const l of lines) handle(l);
        }
        if (buf) handle(buf);
        window.__sse.push({ tMs: performance.now() - sendT0, isoUtc: new Date().toISOString(), raw: '<stream closed>', type: 'STREAM_CLOSED', parsed: null });
      } catch (e) { window.__sse.push({ tMs: performance.now() - sendT0, isoUtc: new Date().toISOString(), raw: '<reader error> ' + (e && e.message), type: 'STREAM_ERROR', parsed: null }); }
    })();
    return res;
  };

  // (d) MutationObserver — first-appearance timestamps
  const SELECTORS = [
    '[data-testid=pending-row]', '[data-testid=plugin-activity]', '[data-testid=plugin-activity][data-state=failed]',
    '[data-testid=plugin-activity][data-state=searched]', '[data-testid=plugin-activity][data-state=searching]', '[data-testid=thinking-trace]', '[data-testid=citation-chip]',
    '[data-testid=step-summary]', '[data-testid=source-link]', '[data-testid=answer-badge]', '[data-testid=chat-error]', '.oiu-assistant p', '[data-testid=assistant-message]', '[data-testid=assistant-streaming]',
  ];
  window.__pluginStates = [];
  const check = () => {
    const now = performance.now();
    for (const s of SELECTORS) {
      if (window.__firstSeen[s] != null) continue;
      let el = null; try { el = document.querySelector(s); } catch {}
      if (s === '.oiu-assistant p') { if (el && !(el.textContent || '').trim()) el = null; }
      if (el) window.__firstSeen[s] = { t: now, iso: new Date().toISOString(), text: (el.textContent || '').slice(0, 200), sinceSend: window.__sendT0 != null ? now - window.__sendT0 : null };
    }
    const pa = document.querySelector('[data-testid=plugin-activity]');
    if (pa) { const st = pa.getAttribute('data-state'); const prev = window.__pluginStates[window.__pluginStates.length - 1]; if (!prev || prev.state !== st) window.__pluginStates.push({ state: st, t: now, text: (pa.textContent || '').slice(0, 300) }); }
  };
  const start = () => {
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'aria-label'] });
    check();
  };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);

  // (e) scroll sampler every 250 ms
  const isScrollable = (el) => { if (!el || el === document.body) return false; const cs = getComputedStyle(el); return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1; };
  const findScroller = () => {
    const sa = document.querySelector('.chat-shell .openui-agent-thread-scroll-area');
    if (sa && isScrollable(sa)) return sa; // OpenUI's real thread scroller (the page itself never scrolls on /chat)
    const t = document.querySelector('.openui-agent-thread');
    if (t && isScrollable(t)) return t;
    let el = document.querySelector('.oiu-assistant') || t;
    while (el && el !== document.body) { if (isScrollable(el)) return el; el = el.parentElement; }
    if (t) return t;
    return document.scrollingElement || document.documentElement;
  };
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  setInterval(() => {
    if (window.__sendT0 == null) return;
    const sc = findScroller(); if (!sc) return;
    const txts = document.querySelectorAll('.oiu-assistant p, .oiu-assistant li, .oiu-assistant h1, .oiu-assistant h2, .oiu-assistant h3, .oiu-assistant td, .oiu-assistant__body');
    let anyText = false; for (const el of txts) { if ((el.textContent || '').trim() && visible(el)) { anyText = true; break; } }
    const plugin = document.querySelector('[data-testid=plugin-activity]'); const pending = document.querySelector('[data-testid=pending-row]'); const err = document.querySelector('[data-testid=chat-error]');
    const atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 24;
    window.__scroll.push({ t: performance.now() - window.__sendT0, scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, atBottom, anyText, pluginVisible: visible(plugin), pendingVisible: visible(pending), errorVisible: visible(err), scroller: sc.className ? String(sc.className).slice(0, 60) : sc.tagName });
  }, 250);
})();
