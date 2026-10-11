# a34 — CLS proof (Fast 3G, PerformanceObserver layout-shift, networkidle + 2 s)
Spec: `web/e2e/cls-skeletons.spec.ts` (run with `--project=desktop --workers=1`; the spec sets both viewports itself).
`baseline-7c43344/` = run against the live main deployment BEFORE the a34 skeletons (ISR-cached pages, so loading.tsx rarely shows);
top-level `<route>-<WxH>.json` = latest run. Baseline (before): companies 0.0001 / 0.0002, company/fervo-energy 0.001 / 0.0007,
news 0.0461 / 0.0001 (desktop source: `[data-testid=main-column] > footer` pushed down when the feed hydrates), artifacts 0 / 0 (1440×900 / 390×844).
