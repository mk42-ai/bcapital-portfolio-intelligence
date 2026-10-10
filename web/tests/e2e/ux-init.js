// Injected via context.addInitScript BEFORE navigation (pure browser code, no imports).
// Instruments the chat page for tests/e2e/run-ux.spec.ts:
//   (a) fetch tap on /api/chat — every SSE frame stamped with ms since window.__ux.mark() (the send keypress)
//   (b) MutationObserver log — every DOM change with a filler/progress vs content classification + viewport visibility
//   (c) first-appearance timestamps for the visible UX milestones (scoped to the CURRENT turn: nodes created after mark())
//   (d) PerformanceObserver buffers — layout-shift (with source nodes), long-animation-frame, longtask
(() => {
  if (window.__ux) return;
  const desc = (n) => {
    if (!n) return null;
    const el = n.nodeType === 3 ? n.parentElement : n;
    if (!el || !el.tagName) return String(n.nodeName || n);
    const tid = el.getAttribute && el.getAttribute('data-testid');
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return `${el.tagName.toLowerCase()}${tid ? `[data-testid=${tid}]` : ''}${cls}`.slice(0, 140);
  };
  const W = (window.__ux = {
    turn: 0, prompt: '', sendT0: null, sendWall: null, frames: [], mutations: [], firstSeen: {}, pluginStates: [],
    perf: { layoutShifts: [], loaf: [], longTasks: [] }, request: { body: null, status: null, headersAt: null }, notes: [],
  });
  const rel = (t) => (W.sendT0 == null ? null : +(t - W.sendT0).toFixed(1));
  W.mark = (turn, prompt) => { W.turn = turn; W.prompt = prompt; W.sendT0 = performance.now(); W.sendWall = Date.now(); };
  W.reset = () => {
    W.frames = []; W.mutations = []; W.firstSeen = {}; W.pluginStates = []; W.perf = { layoutShifts: [], loaf: [], longTasks: [] };
    W.request = { body: null, status: null, headersAt: null }; W.sendT0 = null; W.sendWall = null; W.anchor = null;
    // Everything already in the DOM belongs to a previous turn: mark it so first-seen only fires for NEW nodes.
    for (const el of document.querySelectorAll('[data-testid]')) el.setAttribute('data-ux-seen', '1');
  };

  // (d) PerformanceObserver buffers ---------------------------------------------------------------
  const po = (type, fn, extra = {}) => { try { const o = new PerformanceObserver((l) => { for (const e of l.getEntries()) fn(e); }); o.observe({ type, buffered: true, ...extra }); return true; } catch { return false; } };
  po('layout-shift', (e) => W.perf.layoutShifts.push({ t: e.startTime, rel: rel(e.startTime), value: +e.value.toFixed(5), hadRecentInput: !!e.hadRecentInput, nodes: (e.sources || []).slice(0, 4).map((s) => ({ node: desc(s.node), from: s.previousRect && [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height], to: s.currentRect && [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height] })) }));
  W.loafSupported = po('long-animation-frame', (e) => W.perf.loaf.push({ t: e.startTime, rel: rel(e.startTime), dur: +e.duration.toFixed(1), blocking: +(e.blockingDuration || 0).toFixed(1), scripts: (e.scripts || []).slice(0, 3).map((s) => String(s.invoker || s.sourceURL || s.name || '').slice(0, 120)) }));
  po('longtask', (e) => W.perf.longTasks.push({ t: e.startTime, rel: rel(e.startTime), dur: +e.duration.toFixed(1) }));

  // (a) fetch tap --------------------------------------------------------------------------------
  const origFetch = window.fetch.bind(window);
  const strip = (o) => { if (!o || typeof o !== 'object') return o; const c = Array.isArray(o) ? [] : {}; for (const k of Object.keys(o)) c[k] = /apikey|api_key|x-ondemand-key|authorization/i.test(k) ? '[stripped]' : strip(o[k]); return c; };
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/\/api\/chat(\?|$)/.test(url)) return origFetch(input, init);
    if (W.sendT0 == null) W.mark(W.turn || 1, W.prompt);
    const t0 = W.sendT0;
    try { W.request.body = strip(JSON.parse(String(init && init.body))); } catch { W.request.body = { unparsed: true }; }
    const res = await origFetch(input, init);
    W.request.status = res.status; W.request.headersAt = +(performance.now() - t0).toFixed(1);
    if (!res.body) return res;
    const clone = res.clone();
    (async () => {
      const reader = clone.body.getReader(); const dec = new TextDecoder(); let buf = '';
      const push = (raw) => {
        const rec = { turn: W.turn, tMs: +(performance.now() - t0).toFixed(1), wallIso: new Date().toISOString(), raw };
        if (raw.trim() === '[DONE]') rec.type = '[DONE]';
        else { try { const p = JSON.parse(raw); rec.type = p.type || null; rec.name = p.name || null; const v = p.value && typeof p.value === 'object' ? p.value : null; if (v) { rec.phase = v.phase ?? null; rec.statusType = v.statusType ?? null; rec.eventType = v.eventType ?? null; rec.event = v.event ?? null; } rec.toolCallId = p.toolCallId || null; rec.toolCallName = p.toolCallName || null; rec.deltaLen = typeof p.delta === 'string' ? p.delta.length : null; } catch { rec.type = 'unparsed'; } }
        W.frames.push(rec);
      };
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split(/\r?\n/); buf = lines.pop() ?? '';
          for (const l of lines) if (l.startsWith('data:')) push(l.slice(5).replace(/^ /, ''));
        }
        if (buf.startsWith('data:')) push(buf.slice(5).replace(/^ /, ''));
        W.frames.push({ turn: W.turn, tMs: +(performance.now() - t0).toFixed(1), wallIso: new Date().toISOString(), raw: '<stream closed>', type: 'STREAM_CLOSED' });
      } catch (e) { W.frames.push({ turn: W.turn, tMs: +(performance.now() - t0).toFixed(1), wallIso: new Date().toISOString(), raw: '<reader error> ' + (e && e.message), type: 'STREAM_ERROR' }); }
    })();
    return res;
  };

  // (b)+(c) MutationObserver ---------------------------------------------------------------------
  const FILLER = '[data-testid=filler],[data-testid=working-band],[data-testid=pending-row],.oiu-shimmer,.oiu-working,.oiu-activity__elapsed,.openui-agent-thread-message-loading,.oiu-caret,[data-testid=stall-tick],.oiu-slot';
  const SELECTORS = {
    pending_row: '[data-testid=pending-row]', thinking_trace: '[data-testid=thinking-trace]', plugin_card: '[data-testid=plugin-activity]',
    plugin_searching: '[data-testid=plugin-activity][data-state=searching]', plugin_searched: '[data-testid=plugin-activity][data-state=searched]', plugin_failed: '[data-testid=plugin-activity][data-state=failed]',
    plan_stepper: '[data-testid=plan-stepper]', summarising_pill: '[data-testid=step-summary][data-state=pending]', summary_done: '[data-testid=step-summary][data-state=done]',
    citation_chip: '[data-testid=citation-chip]', sources_rail: '[data-testid=sources-rail]', sources_rail_nonempty: '[data-testid=sources-rail]:not([data-count="0"])', source_link: '[data-testid=source-link]',
    answer_badge: '[data-testid=answer-badge]', chat_error: '[data-testid=chat-error]', plugin_error_card: '[data-testid=plugin-error-card]', filler: '[data-testid=filler],[data-testid=working-band]',
    assistant_streaming: '[data-testid=assistant-streaming]', assistant_message: '[data-testid=assistant-message]', answer_markdown: '[data-testid=answer-markdown]', request_disclosure: '[data-testid=request-disclosure]',
    rail_plan: '[data-testid=rail-plan]', run_plugins: '[data-testid=run-plugins]', prompt_card: '[data-testid=clarification-form],[data-testid=creds-form],[data-testid=approval-card]',
  };
  const inView = (el) => { try { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; } catch { return false; } };
  const findAnchor = () => {
    if (W.anchor && W.anchor.isConnected) return W.anchor;
    if (!W.prompt) return null;
    const p = W.prompt.trim();
    let best = null;
    for (const el of document.querySelectorAll('.chat-shell p, .chat-shell div, .chat-shell span')) { if (el.children.length === 0 && (el.textContent || '').trim() === p) best = el; }
    W.anchor = best; return best;
  };
  const isNew = (el) => {
    if (el.hasAttribute('data-ux-seen')) return false;
    const a = findAnchor();
    if (!a) return W.turn <= 1; // turn 1: nothing earlier can match
    return !!(a.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  };
  const check = (now) => {
    for (const [key, sel] of Object.entries(SELECTORS)) {
      if (W.firstSeen[key]) continue;
      let el = null; try { for (const c of document.querySelectorAll(sel)) { if (isNew(c)) { if (key === 'answer_markdown' && !(c.textContent || '').trim()) continue; el = c; break; } } } catch {}
      if (el) W.firstSeen[key] = { t: now, rel: rel(now), iso: new Date().toISOString(), inView: inView(el), text: (el.textContent || '').slice(0, 160), node: desc(el) };
    }
    const pa = Array.from(document.querySelectorAll('[data-testid=plugin-activity]')).filter(isNew);
    for (const el of pa) { const st = el.getAttribute('data-state'); const pid = el.getAttribute('data-plugin'); const prev = W.pluginStates.filter((x) => x.pluginId === pid).pop(); if (!prev || prev.state !== st) W.pluginStates.push({ pluginId: pid, state: st, rel: rel(now), text: (el.textContent || '').slice(0, 200) }); }
  };
  const start = () => {
    const mo = new MutationObserver((list) => {
      const now = performance.now();
      let filler = 0, content = 0, visible = false; const targets = [];
      for (const m of list) {
        const el = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        if (!el || !(el instanceof Element)) continue;
        if (el.closest(FILLER)) filler++; else content++;
        if (!visible && inView(el)) visible = true;
        if (targets.length < 4) { const d = desc(el); if (!targets.includes(d)) targets.push(d); }
      }
      if (W.mutations.length < 40000) W.mutations.push({ t: +now.toFixed(1), rel: rel(now), filler, content, visible, targets });
      check(now);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true, attributeFilter: ['data-state', 'data-count', 'aria-expanded', 'class', 'style', 'data-phase'] });
    check(performance.now());
  };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);

  // (e) filler-animation sampler: a CSS-animated skeleton/spinner is a visible change the MutationObserver cannot see.
  W.fillerSamples = [];
  setInterval(() => {
    if (W.sendT0 == null) return;
    let animating = false; const kinds = [];
    try {
      for (const a of document.getAnimations()) {
        if (a.playState !== 'running') continue;
        const el = a.effect && a.effect.target; if (!el || !(el instanceof Element)) continue;
        if (!el.closest(FILLER + ',.oiu-spin,.oiu-shimmer span,.oiu-working,[data-testid=filler]')) continue;
        if (!inView(el)) continue;
        animating = true; const d = desc(el); if (!kinds.includes(d) && kinds.length < 3) kinds.push(d);
      }
    } catch {}
    if (W.fillerSamples.length < 20000) W.fillerSamples.push({ rel: rel(performance.now()), animating, kinds });
  }, 200);
})();
