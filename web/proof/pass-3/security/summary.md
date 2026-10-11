# Pass-3 security report (a43)

Generated 2026-10-11T12:06:13.697Z · node v22.23.3 · npm 12.2.0

## Secret scan (`scripts/secret-scan.sh`, git-tracked files only)

Scanned **1544** tracked files @ 7c43344: **0 finding(s)**, 203 info item(s).

Checks: tracked `.env*` (non-example) · `$ON_DEMAND_API_KEY` value · GitHub/Vercel/OpenAI/AWS token patterns · `INGEST_SECRET=<64 hex>` · Azure SAS `sig=` in code dirs (docs/proof → info) · private keys · JWT-looking strings in code dirs (docs/proof → info).

No findings.

Info items by rule/file (signed URLs in proof/docs/manifests, not source):

- azure-sas-sig-in-docs · web/proof/qa/j6-plugins.json: 182
- azure-sas-sig-in-docs · web/public/assets/bundle/manifest.json: 21

## npm audit — web (`web`)

Status: **npm audit ran online**

### `npm audit --json --omit=dev`

exit code 1, 577 deps audited

| critical | high | moderate | low | info | total |
|---|---|---|---|---|---|
| 0 | 1 | 1 | 5 | 0 | 7 |

| package | severity | range | direct | fix available | via |
|---|---|---|---|---|---|
| @openuidev/react-ui | low | * | true | false | rehype-katex; remark-math |
| katex | low | 0.11.0 - 0.18.1 | false | false | KaTeX: Existing prototype pollution can bypass trust restrictions (https://github.com/advisories/GHSA-238p-pmpm-9mq7) |
| micromark-extension-math | low | * | false | false | katex |
| next | moderate | 9.3.4-canary.0 - 16.3.0-preview.10 | true | true | postcss |
| postcss | high | <=8.5.22 | false | true | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output (https://github.com/advisories/GHSA-qx2v-qp2m-jg93); PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments (https://github.com/advisories/GHSA-6g55-p6wh-862q); PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset (https://github.com/advisories/GHSA-fxqj-rqcc-2cmp); PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure (https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| rehype-katex | low | >=2.0.0 | false | false | katex |
| remark-math | low | >=4.0.0 | false | false | micromark-extension-math |

### `npm audit --json`

exit code 1, 577 deps audited

| critical | high | moderate | low | info | total |
|---|---|---|---|---|---|
| 0 | 9 | 20 | 5 | 0 | 34 |

| package | severity | range | direct | fix available | via |
|---|---|---|---|---|---|
| @opentelemetry/core | moderate | <2.8.0 | false | true | OpenTelemetry Core: Unbounded memory allocation in W3C Baggage propagation (https://github.com/advisories/GHSA-8988-4f7v-96qf) |
| @opentelemetry/instrumentation-amqplib | moderate | <=0.46.1 | false | true | @opentelemetry/core |
| @opentelemetry/instrumentation-connect | moderate | <=0.43.1 | false | true | @opentelemetry/core |
| @opentelemetry/instrumentation-express | moderate | <=0.47.1 | false | true | @opentelemetry/core |
| @opentelemetry/instrumentation-fs | moderate | <=0.19.1 | false | true | @opentelemetry/core |
| @opentelemetry/instrumentation-hapi | moderate | 0.24.0 - 0.45.2 | false | true | @opentelemetry/core |
| @opentelemetry/instrumentation-http | moderate | <=0.16.0 || 0.19.1-alpha.7 - 0.218.0 | false | true | @opentelemetry/core |
| @opentelemetry/instrumentation-knex | moderate | <0.65.0 | false | true | Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute (https://github.com/advisories/GHSA-qqmp-wf37-98f9) |
| @opentelemetry/instrumentation-koa | moderate | <=0.15.0 || 0.20.0 - 0.47.1 | false | true | @opentelemetry/core |
| @opentelemetry/instrumentation-mongoose | moderate | <=0.66.0 | false | true | @opentelemetry/core; Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute (https://github.com/advisories/GHSA-qqmp-wf37-98f9) |
| @opentelemetry/instrumentation-mysql | moderate | <0.67.0 | false | true | Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute (https://github.com/advisories/GHSA-qqmp-wf37-98f9) |
| @opentelemetry/instrumentation-mysql2 | moderate | <=0.66.0 | false | true | @opentelemetry/sql-common; Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute (https://github.com/advisories/GHSA-qqmp-wf37-98f9) |
| @opentelemetry/instrumentation-pg | moderate | <=0.72.0 | false | true | @opentelemetry/core; @opentelemetry/sql-common; Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute (https://github.com/advisories/GHSA-qqmp-wf37-98f9) |
| @opentelemetry/instrumentation-tedious | moderate | <0.40.0 | false | true | Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute (https://github.com/advisories/GHSA-qqmp-wf37-98f9) |
| @opentelemetry/instrumentation-undici | moderate | <=0.10.1 | false | true | @opentelemetry/core |
| @opentelemetry/resources | moderate | 0.8.0 - 2.7.1 | false | true | @opentelemetry/core |
| @opentelemetry/sdk-trace-base | moderate | <=2.7.1 | false | true | @opentelemetry/core; @opentelemetry/resources |
| @opentelemetry/sql-common | moderate | <=0.40.1 | false | true | @opentelemetry/core |
| @openuidev/react-ui | low | * | true | false | rehype-katex; remark-math |
| @puppeteer/browsers | high | * | false | true | extract-zip; proxy-agent |
| @sentry/node | moderate | 8.0.0-alpha.1 - 10.53.1 | false | true | @opentelemetry/core; @opentelemetry/instrumentation-amqplib; @opentelemetry/instrumentation-connect; @opentelemetry/instrumentation-express; @opentelemetry/instrumentation-fs |
| basic-ftp | high | <=6.2.0 | false | true | basic-ftp: Quadratic-time CPU denial of service in Client.list() Unix directory-listing parser (RE_LINE backtracking) (https://github.com/advisories/GHSA-c475-qrg2-pj4r) |
| extract-zip | high | * | false | true | extract-zip unvalidated symlink path traversal (https://github.com/advisories/GHSA-jmr9-qjv8-65gv); extract-zip allows arbitrary file writes through symlink archive entries (https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) |
| get-uri | high | >=5.0.0 | false | true | basic-ftp |
| katex | low | 0.11.0 - 0.18.1 | false | false | KaTeX: Existing prototype pollution can bypass trust restrictions (https://github.com/advisories/GHSA-238p-pmpm-9mq7) |
| lighthouse | high | 10.1.1-dev.20230414 - 10.1.1-dev.20230503 || 10.2.0-dev.20230504 - 13.4.0 | true | true | @sentry/node; puppeteer-core |
| micromark-extension-math | low | * | false | false | katex |
| next | moderate | 9.3.4-canary.0 - 16.3.0-preview.10 | true | true | postcss |
| pac-proxy-agent | high | >=6.0.0 | false | true | get-uri |
| postcss | high | <=8.5.22 | false | true | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output (https://github.com/advisories/GHSA-qx2v-qp2m-jg93); PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments (https://github.com/advisories/GHSA-6g55-p6wh-862q); PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset (https://github.com/advisories/GHSA-fxqj-rqcc-2cmp); PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure (https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| proxy-agent | high | >=6.0.0 | false | true | pac-proxy-agent |
| puppeteer-core | high | 19.8.4 - 24.43.1 | false | true | @puppeteer/browsers |
| rehype-katex | low | >=2.0.0 | false | false | katex |
| remark-math | low | >=4.0.0 | false | false | micromark-extension-math |

## npm audit — root (`.`)

Status: **npm audit ran online**

### `npm audit --json --omit=dev`

exit code 0, 97 deps audited

| critical | high | moderate | low | info | total |
|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 0 |

### `npm audit --json`

exit code 1, 97 deps audited

| critical | high | moderate | low | info | total |
|---|---|---|---|---|---|
| 0 | 0 | 4 | 0 | 0 | 4 |

| package | severity | range | direct | fix available | via |
|---|---|---|---|---|---|
| @esbuild-kit/core-utils | moderate | * | false | true | esbuild |
| @esbuild-kit/esm-loader | moderate | * | false | true | @esbuild-kit/core-utils |
| drizzle-kit | moderate | 0.19.0 - 1.0.0-beta.1-fd8bfcc | true | true | @esbuild-kit/esm-loader |
| esbuild | moderate | <=0.24.2 | false | true | esbuild enables any website to send any requests to the development server and read the response (https://github.com/advisories/GHSA-67mh-4wv8-2f99) |

## How to re-run

```
scripts/secret-scan.sh --out web/proof/pass-3/security/secret-scan.json   # exit 1 on findings
cd web && node scripts/npm-audit.mjs                                      # writes npm-audit-*.json + summary.md
```
