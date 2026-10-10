# Reconciliation — five sample companies vs enriched profiles

Agent 14 (Team C intelligence quality) · 2026-10-10 · read-only. JSON twin: `/tmp/recon/reconciliation.json`.

## Summary

| Company | accuracy_pct | match | partial | conflict | missing | not-in-GT | reported coverage_pct | aggregator flags | DB employees / hq |
|---|---|---|---|---|---|---|---|---|---|
| Perplexity AI | **93.8%** | 7 | 1 | 0 | 0 | 5 | 100 | 0 | 9642026 / San Francisco, United States |
| Apptronik | **60.0%** | 4 | 4 | 0 | 2 | 3 | 73 | 3 | 300 / Austin, TX |
| Fervo Energy | **62.5%** | 4 | 2 | 1 | 1 | 5 | 93 | 1 | 214 / Houston, United States |
| Flutterwave | **60.0%** | 4 | 4 | 0 | 2 | 3 | 87 | 3 | 889 / San Francisco, US |
| WRITER | **80.0%** | 7 | 2 | 0 | 1 | 3 | 93 | 1 | 693 / San Francisco, US |

accuracy_pct = (MATCH + 0.5·PARTIAL) / (fields compared, excluding NOT_IN_GROUND_TRUTH). MISSING counts in the denominator.

## Cross-cutting findings

- CRITICAL DB bug: perplexity-ai.employees = 9642026 (string '964 (estimate, March 2026)' digit-stripped). Headcount writer must parse the leading integer only.
- Apptronik profile dropped description/sector/hq/headcount because the hallucination guard found no matching source_url — trivially known facts (Austin TX, ~300) were lost; the guard should fall back to a lower-trust tag rather than 'unknown'.
- Fervo total_raised conflates IPO proceeds with lifetime capital and funding_rounds omit all four private rounds, including the B Capital-led $462M Series E.
- 13 aggregator-flagged URL occurrences across 4 companies (multiples.vc, seedtable, distillintelligence); total_raised for Flutterwave and WRITER and last_valuation for Apptronik rest solely on multiples.vc.
- recent_news is dated and URL-sourced for every company, but quality is uneven: Perplexity 3/5 SEO/blog pages, Flutterwave 4/5 self-published with 3 near-duplicates, WRITER 5/5 self-published, Fervo only 4 items with 2 landing-page URLs, Apptronik ~3 months stale.
- DB sentiment is seed-based (basis 2026-10-09) and was not refreshed from this enrichment; directions agree for all five except Flutterwave (DB positive 0.4 vs enriched 'mixed').
- plugin_status: every plugin reports 'attached, no sources frame' and all values carry plugin='answer' — provenance to the individual plugins is lost. WRITER's Perplexity plugin was BLOCKED (not enough credits).

## Ground-truth internal inconsistencies

- Apptronik: 'Series A $350M upsized to $403M/$415M' + '$520M' = $923M–$935M, yet 'total Series A $935M' and 'total raised ≈$1B' are both given — the $1B is lifetime (adds ~$28.6M seed + grants); aggregators' $1.3B double-counts the upsized closes.
- Fervo: IPO 80.5M × $27 = $2.17B ✓, but 'Reuters eyed $6.5B valuation' vs DB '~$10.1B mkt cap at IPO' and 'PM mark ~$20.2B Sep 2026' and 'Series E at ~$1.4B post' — the valuation history is not internally consistent across reference and DB. 'Cape Station first power Q4 2026' is superseded by commercial operation declared Oct 1 2026 (TechCrunch/IR).
- Flutterwave: valuation quoted as $3.2B (TechCrunch/PR) and $3.25–3.3B (Bloomberg/PYMNTS) — a reported range, not a single value; '34–35 African countries' is itself a range; Series E size 'undisclosed' in reference vs '$262.75M' in DB stage.
- Perplexity: 'total raised ≈$1.5–1.7B' is a range; Dec 2024 and Jun 2024 rounds carry valuations but no amounts.
- WRITER: no inconsistencies found.

## Perplexity AI — accuracy 93.8%

| Field | Ground truth | Enriched | Source (date) | Verdict | Note |
|---|---|---|---|---|---|
| hq | San Francisco | San Francisco, United States | en.wikipedia.org  | **MATCH** | Same city; enriched adds country. |
| founded | 2022 | 2022 | en.wikipedia.org  | **MATCH** | Exact. |
| ceo | null | Aravind Srinivas | www.linkedin.com  | **NOT_IN_GROUND_TRUTH** | Reference names Srinivas only as first founder, not as CEO; enriched 'Aravind Srinivas' is consistent with public record. Source is a LinkedIn profile URL (weak). |
| founders | ["Aravind Srinivas", "Denis Yarats", "Johnny Ho", "Andy Konwinski"] | ["Aravind Srinivas", "Denis Yarats", "Johnny Ho", "Andy Konwinski"] | en.wikipedia.org  | **MATCH** | All four names match, same order. |
| headcount | null | 964 (estimate, March 2026) | www.reveliolabs.com (2026-03) ⚠secondary / low-authority source | **NOT_IN_GROUND_TRUTH** | 964 (Revelio Labs estimate, Mar 2026). NOTE: DB row stores employees=9642026 — the string '964 (estimate, March 2026)' was digit-stripped into one integer. Critical write bug. |
| total_raised | ≈$1.5–1.7B (Nvidia, Jeff Bezos, SoftBank, IVP, NEA) | $1.5B–$1.72B | www.revenuememo.com (2026-06) ⚠secondary / low-authority source | **MATCH** | Range $1.5B–$1.72B equals the reference range to rounding. Source revenuememo.com is a newsletter, not primary. |
| last_valuation | $20B (Sep 2025, $200M round; The Information via TechCrunch) | $20B (Sep 2025) | www.revenuememo.com (2025-09) ⚠secondary / low-authority source | **MATCH** | Same value and month. Enriched cites revenuememo.com rather than The Information/TechCrunch; also does not surface the reported Nvidia talks at >$30B (Aug 2026) as a 'latest reported' figure — only in news. |
| funding_rounds | [{"date": "2025-09", "amount": "$200M", "valuation": "$20B"}, {"date": "2025-05", "amount": "$500M", "lead": "… | 2025-12-01 Undisclosed Angel / strategic tranche; 2025-09-01 $200M Series E extension; 2025-07-01 $100M Series… | perplexityaimagazine.com; www.cbinsights.com; www.revenuememo.com ⚠secondary / low-authority source | **MATCH** | 4/4 reference rounds matched by date (Sep-25 $200M; May-25 $500M Accel; Dec-24 $500M; Jun-24 $250M). Enriched schema carries no round valuations so $20B/$14B/$9B/$3B are not represented. Extras NOT_IN_GROUND_TRUTH: Jul-25 $100M, Series B $73.6M (perplexityaima… |
| key_products | Comet browser (free worldwide since Oct 2 2025); answer engine | ["Answer Engine / Ask (launched Dec 2022)", "Pro Search and premium subscription tiers (Pro, Max, Enterprise P… | en.wikipedia.org  | **MATCH** | Comet Browser present plus answer engine, Pro/Max/Enterprise, Assistant, agentic commerce. 'Free worldwide since Oct 2 2025' detail not captured. |
| competitors | null | ["OpenAI", "Google", "Anthropic", "Microsoft", "Other AI search/answer engines (You.com, Copilot tools)"] | en.wikipedia.org  | **NOT_IN_GROUND_TRUTH** | OpenAI, Google, Anthropic, Microsoft, You.com — plausible. |
| recent_news | ["Nvidia in talks at >$30B (Aug 2026)", "ARR >$750M annualized (Aug 2026) up from $450M (Mar 2026)", "IPO plan… | 2026-10-10 topconsumerreviews.com; 2026-10-09 docs.perplexity.ai; 2026-10-08 techaimag.com; 2026-10-07 scriptb… | www.topconsumerreviews.com; docs.perplexity.ai; www.techaimag.com; www.scriptbyai.com; www.reuters.com ⚠secondary / low-authority source | **PARTIAL** | 5 items, all dated (Aug 24–Oct 10 2026) and URL-sourced. Only 1/5 is a credible news item matching the reference (Reuters: Nvidia $30B+ talks). The other four are an SEO review site, the company's own API changelog, a niche AI blog, and a timeline page — plaus… |
| risk_signals | null | ["Copyright/content-scraping litigation from Dow Jones/News Corp, The New York Times, Nikkei, Asahi and BBC", … | en.wikipedia.org  | **NOT_IN_GROUND_TRUTH** | Copyright litigation (Dow Jones/NYT/BBC), stealth crawling, hallucination, trademark, privacy suit — consistent with public record (Wikipedia-sourced). |
| social_sentiment | null | Mixed to moderately negative among vocal users on X/Twitter, with consistent praise for cited real-time resear… | x.com  | **NOT_IN_GROUND_TRUTH** | 'Mixed to moderately negative' agrees in direction with DB sentiment score -0.35 (negative). Source is a single X post. |

Round-by-round:

- MATCH: GT `2025-09 $200M` ↔ enriched `2025-09-01 $200M Series E extension`
- MATCH: GT `2025-05 $500M led by Accel` ↔ enriched `2025-05-01 $500M Series E, Accel`
- MATCH (date); amount NOT_IN_GROUND_TRUTH: GT `2024-12 (amount not in GT) @ $9B` ↔ enriched `2024-12-01 $500M Series D (IVP, SoftBank, Nvidia, Bezos)`
- MATCH (date); amount NOT_IN_GROUND_TRUTH: GT `2024-06 (amount not in GT) @ $3B` ↔ enriched `2024-06-01 $250M Series C`
- NOT_IN_GROUND_TRUTH — dubious, needs confirmation: GT `None` ↔ enriched `2025-12-01 Undisclosed 'Cristiano Ronaldo (reported)'`

**DB row check:** hq MATCH ('San Francisco, United States'). employees = 9642026 — WRONG: profile headcount '964 (estimate, March 2026)' was digit-stripped into a single integer (964||2026). Must be 964. status private OK. sentiment -0.35 'negative' (seed basis 2026-10-09) agrees with enriched 'mixed to moderately negative'. latest_news top item = topconsumerreviews.com (low value).

Secondary / low-authority URLs (verify):
- https://www.reveliolabs.com/companies/perplexity-ai/employees
- https://www.revenuememo.com/p/perplexity-funding
- https://perplexityaimagazine.com/perplexity-hub/perplexity-ai-investors-list/
- https://www.cbinsights.com/company/perplexity-ai/financials
- https://www.topconsumerreviews.com/best-ai-models/reviews/perplexity.php
- https://www.techaimag.com/ai-news/perplexity-ai-unveils-new-pplx-embed-v2-late-models
- https://www.scriptbyai.com/perplexity-ai-timeline/

## Apptronik — accuracy 60.0%

| Field | Ground truth | Enriched | Source (date) | Verdict | Note |
|---|---|---|---|---|---|
| hq | Austin, TX | unknown | —  | **MISSING** | Enriched 'unknown' — value was dropped because its source_url was not present in plugin results (hallucination guard). DB row still carries 'Austin, TX' from seed, consistent with reference. |
| founded | 2016 (UT Austin spinout) | 2016 | apptronik.com  | **MATCH** | Exact; sourced to apptronik.com. |
| ceo | Jeff Cardenas | Jeff Cardenas | apptronik.com  | **MATCH** | Exact; sourced to apptronik.com/company/leadership. |
| founders | null | ["Jeff Cardenas", "Nicholas \"Dr. Nick\" Paine", "Bill Helmsing"] | www.crunchbase.com  | **NOT_IN_GROUND_TRUTH** | Cardenas, Nick Paine, Bill Helmsing (Crunchbase) — consistent with the UT Austin HCRL spinout history; reference does not list names. |
| headcount | ~300 employees (Feb 2026) | unknown | —  | **MISSING** | Enriched 'unknown' (dropped — unsourced). DB row has employees=300 from seed, which matches reference. |
| total_raised | ≈$1B lifetime; 'total Series A $935M' | $935M | techcrunch.com (2026-02-11)  | **PARTIAL** | Enriched '$935M' (TechCrunch, Feb 11 2026) is the SERIES A TOTAL ($350M Feb-25 + $53M Mar-25 close = $403M, + $520M Feb-26 = $923M; company says 'over $935M' because the first close was later reported as $415M). The reference's '≈$1B' is LIFETIME capital = Ser… |
| last_valuation | post-money ≈$5.3B (Feb 2026) | $5.3B (Feb 2026) | multiples.vc (2026-02-11) ⚠aggregator source | **MATCH** | Value matches, but the only source is multiples.vc (aggregator). TechCrunch headline says '$5B+'; the $5.3B figure is reported by Austin Business Journal/Bloomberg — needs primary confirmation. |
| funding_rounds | [{"date": "2025-02-13", "amount": "$350M Series A", "lead": "B Capital + Capital Factory (co-lead), Google par… | 2026-02-11 $520M Series A Extension; 2025-03-01 $53M Series A oversubscription; 2025-02-01 $350M Series A; ? $… | multiples.vc; seedtable.com; sterlingcharts.com ⚠aggregator source | **PARTIAL** | All reference rounds matched by date/amount: $350M (2025-02), $53M oversubscription (2025-03, = the $403M upsizing), $520M (2026-02-11). Lead lists are incomplete (PEAK6 missing on the extension; Google shown as co-lead on the $350M round whereas reference say… |
| key_products | Apollo humanoid | ["Apollo (general-purpose humanoid robot)", "Apollo 2 (modular bipedal/wheeled humanoid with improved actuator… | apptronik.com  | **MATCH** | Apollo + Apollo 2 (apptronik.com). |
| competitors | ["Figure AI", "1X", "Tesla Optimus", "Agility Robotics", "Boston Dynamics"] | ["Figure AI", "Unitree Robotics", "Agility Robotics", "Boston Dynamics", "Sanctuary AI", "Physical Intelligenc… | www.cbinsights.com ⚠secondary / low-authority source | **PARTIAL** | 4/5 overlap (Figure AI, Agility, Boston Dynamics, Tesla Optimus); 1X missing; extras Unitree, Sanctuary, Physical Intelligence, NEURA are reasonable. |
| recent_news | ["Cardenas named Austin Business Journal Best CEO (Oct 7 2026)", "$520M extension Feb 11 2026", "Partners Goog… | 2026-07-01 biped.news; 2026-04-28 apptronik.com; 2026-02-19 automate.org; 2026-02-12 bizjournals.com; 2026-02-… | biped.news; apptronik.com; www.automate.org; www.bizjournals.com; techcrunch.com ⚠secondary / low-authority source | **PARTIAL** | 5 items, dated, sourced, plausible (TechCrunch, bizjournals, automate.org, apptronik.com, biped.news). Newest is Jul 1 2026 — the Oct 7 2026 Best CEO award in the reference is absent, so the feed is ~3 months stale. Partner names (DeepMind, Mercedes, GXO, NASA… |
| risk_signals | null | ["No published operational metrics (uptime, intervention rates, cost per task, mass-production proof)", "Execu… | newmarketpitch.com ⚠secondary / low-authority source | **NOT_IN_GROUND_TRUTH** | Plausible but sourced to a single blog (newmarketpitch.com); 'employee sentiment of chaos' is an unattributed claim. |
| social_sentiment | null | Predominantly positive, professional and forward-looking tone on X (~23.5k followers on @Apptronik), with enga… | x.com  | **NOT_IN_GROUND_TRUTH** | 'Predominantly positive' agrees with DB sentiment 0.3 (positive). |

Round-by-round:

- PARTIAL (Google listed as lead; day lost): GT `2025-02-13 $350M Series A, co-led B Capital & Capital Factory` ↔ enriched `2025-02-01 $350M Series A, leads B Capital Group/Capital Factory/Google (multiples.vc)`
- MATCH ($350M+$53M=$403M): GT `upsized to $403M/$415M` ↔ enriched `2025-03-01 $53M 'Series A oversubscription' (sterlingcharts.com)`
- PARTIAL (PEAK6 missing): GT `2026-02-11 $520M ext., leads B Capital/Google/Mercedes-Benz/PEAK6` ↔ enriched `2026-02-11 $520M Series A Extension, leads B Capital/Alphabet/Mercedes-Benz (multiples.vc)`

**DB row check:** hq 'Austin, TX' and employees 300 come from seed, NOT from this enrichment (profile has both as 'unknown'); seed values match reference — enrichment did not overwrite with null, good. status private OK. sentiment 0.3 positive consistent.

**Aggregator-flagged URLs (need primary confirmation):**
- https://multiples.vc/private-comps/apptronik
- https://seedtable.com/companies/apptronik/funding-rounds

Secondary / low-authority URLs (verify):
- https://sterlingcharts.com/companies/apptronik
- https://www.cbinsights.com/company/apptronik/alternatives-competitors
- https://biped.news/article/apptronik-robot-park-apollo-2-2026
- https://newmarketpitch.com/blogs/news/humanoid-robotics-apptronik-update

## Fervo Energy — accuracy 62.5%

| Field | Ground truth | Enriched | Source (date) | Verdict | Note |
|---|---|---|---|---|---|
| hq | Houston, TX | Houston, United States | www.linkedin.com  | **MATCH** | Exact. |
| founded | null | 2017 | www.sec.gov  | **NOT_IN_GROUND_TRUTH** | 2017 (SEC S-1) — correct per public record; reference silent. |
| ceo | Tim Latimer (CEO/co-founder) | Tim Latimer | fervoenergy.com  | **MATCH** | Exact; fervoenergy.com/team. |
| founders | ["Tim Latimer", "Jack Norbeck"] | ["Tim Latimer", "Jack Norbeck"] | fervoenergy.com  | **MATCH** | Exact. CTO title for Norbeck not captured (no field). |
| headcount | null | 214 (estimate) | www.reveliolabs.com (2026-03-01) ⚠secondary / low-authority source | **NOT_IN_GROUND_TRUTH** | 214 (Revelio estimate, Mar 2026). For a public company the 10-Q/S-1 gives an actual figure — estimate should be replaced by filing data. |
| total_raised | Private rounds in reference: $244M (Feb 2024) + $255M (Dec 2024) + $206M project financing (Jun 2025) + $462M … | $2.2B (IPO gross proceeds, 2026) | www.sec.gov (2026-06-30)  | **CONFLICT** | Enriched '$2.2B (IPO gross proceeds, 2026)' is the IPO proceeds ONLY, mislabelled as total raised. Reference: ≥$1.17B of private capital explicitly listed PLUS $2.2B IPO (≈$3.4B+ lifetime, before pre-2024 rounds). Quote — reference: '$462M Series E … $255M … $… |
| last_valuation | IPO May 14 2026: 80.5M shares @ $27 ≈ $2.2B gross; Reuters eyed ≈$6.5B valuation | unknown | —  | **MISSING** | Enriched 'unknown' although the company is public (market cap is observable). NOTE reference/DB inconsistency: reference says Reuters 'eyed $6.5B'; DB stage says '~$10.1B mkt cap' at IPO and 'PM mark ~$20.2B Sep 2026'; DB b_capital_round says Series E at '~$1.… |
| funding_rounds | [{"date": "2025-12-10", "amount": "$462M Series E", "lead": "B Capital; new AllianceBernstein, Google, Mitsui,… | 2026-05-01 $2.2B IPO (NASDAQ: FRVO) | www.sec.gov  | **PARTIAL** | Only 1 of 5 reference rounds present: the IPO ($2.2B, dated 2026-05-01 vs actual 2026-05-14 — month precision). ALL four private rounds are missing, including the $462M Series E led by B Capital (Dec 10 2025) — the most relevant round for this portfolio. Sourc… |
| key_products | Cape Station Phase I ~100 MW (first power Q4 2026), Phase II ~400 MW; 658 MW contracted PPAs; 3 GW Google fram… | ["Enhanced geothermal systems (EGS) firm 24/7 carbon-free power", "Project Red commercial pilot in Nevada (~3 … | fervoenergy.com  | **MATCH** | Cape Station Phase I ~100 MW / Phase II ~400 MW and Project Red captured. Enriched news shows commercial operation declared Oct 1 2026 — AHEAD of the reference's 'first power Q4 2026' (reference is from the Jun 22 2026 results call; newer info, not a conflict)… |
| competitors | null | ["Eavor Technologies", "AltaRock Energy", "Sage Geosystems", "XGS Energy", "GreenFire Energy", "Ormat Technolo… | www.distillintelligence.com ⚠aggregator source | **NOT_IN_GROUND_TRUTH** | Eavor, AltaRock, Sage, XGS, GreenFire, Ormat — plausible; but sole source is distillintelligence.com (aggregator). |
| recent_news | ["Q1 2026 results Jun 22 2026", "TIME #1 America's Top GreenTech Companies 2026", "Two DOE awards ≈$20M (Sep 2… | 2026-10-06 activ8insights.com; 2026-10-01 techcrunch.com; 2026-10-01 ir.fervoenergy.com; 2026-09-22 fervoenerg… | activ8insights.com; techcrunch.com; ir.fervoenergy.com; fervoenergy.com ⚠secondary / low-authority source | **PARTIAL** | Only 4 items (schema expects 5). All dated and plausible; DOE awards (Sep 22) matches reference. Two URLs are landing pages, not articles (fervoenergy.com/category/press-releases, ir.fervoenergy.com/news-events/news-releases); the Morpheus short report is sour… |
| risk_signals | null | ["Financial: Q2 2026 operating loss of $28.7M and net loss of $55.9M, with capex of ~$226.5M and H2 2026 capex… | www.sec.gov  | **NOT_IN_GROUND_TRUTH** | High quality — drawn from the Q2 2026 10-Q (op. loss $28.7M, net loss $55.9M, capex guidance $850–900M, seismicity/short-seller allegations). |
| social_sentiment | null | Predominantly positive, milestone-driven X chatter around Cape Station first power, commercial operation and t… | x.com  | **NOT_IN_GROUND_TRUTH** | 'Predominantly positive with emerging skepticism after Oct short report' is consistent with DB sentiment 0.6 and signal momentum d7 = -0.85. |

Round-by-round:

- PARTIAL (day precision): GT `2026-05-14 IPO ≈$2.2B` ↔ enriched `2026-05-01 $2.2B IPO (NASDAQ: FRVO), SEC`
- MISSING: GT `2025-12-10 $462M Series E led by B Capital` ↔ enriched `None`
- MISSING: GT `2025-06 $206M project financing` ↔ enriched `None`
- MISSING: GT `2024-12 $255M` ↔ enriched `None`
- MISSING: GT `2024-02 $244M` ↔ enriched `None`

**DB row check:** hq MATCH; employees 214 = profile estimate. status 'public (Nasdaq: FRVO)' matches reference. stage carries valuation history ($10.1B mkt cap at IPO, $20.2B Sep 2026) that neither the profile (last_valuation unknown) nor the reference ($6.5B Reuters) agrees with — needs reconciliation. sentiment 0.6 positive consistent.

**Aggregator-flagged URLs (need primary confirmation):**
- https://www.distillintelligence.com/competitors/fervo-energy?utm_source=openai

Secondary / low-authority URLs (verify):
- https://www.reveliolabs.com/companies/fervo-energy/employees?utm_source=openai
- https://activ8insights.com/report/frvo-morpheus-research-10-06-26-2/?utm_source=openai

## Flutterwave — accuracy 60.0%

| Field | Ground truth | Enriched | Source (date) | Verdict | Note |
|---|---|---|---|---|---|
| hq | San Francisco / Lagos (dual HQ) | San Francisco, US | www.linkedin.com  | **PARTIAL** | Enriched 'San Francisco, US' omits the Lagos operating HQ. DB row stores the same single-city value. |
| founded | 2016 | 2016 | www.linkedin.com  | **MATCH** | Exact. |
| ceo | Olugbenga 'GB' Agboola | Olugbenga "GB" Agboola | x.com  | **MATCH** | Exact, but sourced to a random X post rather than company/LinkedIn. |
| founders | null | unknown | —  | **MISSING** | Enriched 'unknown'. Reference is also silent, but founders (GB Agboola, Iyinoluwa Aboyeji) are trivially available — counted as a coverage gap. |
| headcount | null | 889 (estimate) | www.linkedin.com  | **NOT_IN_GROUND_TRUTH** | 889 (LinkedIn estimate). |
| total_raised | >$500M | over $500M | multiples.vc ⚠aggregator source | **MATCH** | 'over $500M' — same figure, but sole source is multiples.vc (aggregator); primary = company press release. |
| last_valuation | $3.2B (Series E, Jun 16 2026; TechCrunch/press release). Bloomberg/PYMNTS report $3.25–3.3B | $3.2B (June 2026) | techcrunch.com (2026-06-16)  | **MATCH** | Enriched '$3.2B (June 2026)' cites TechCrunch — the primary/press-release figure. Classified as a REPORTED RANGE: $3.2B (TechCrunch, company PR) / $3.25B (Bloomberg) / $3.3B (PYMNTS). Enriched correctly anchors on the lowest, press-release value. |
| funding_rounds | [{"date": "2022-02", "amount": "$250M Series D", "lead": "B Capital Group", "valuation": ">$3B"}, {"date": "20… | 2026-07-07 Undisclosed Undisclosed-stage (Series E - II); 2026-06-16 Undisclosed Series E; ? $250M Series D; ?… | multiples.vc; seedtable.com; techcrunch.com; www.cointime.ai ⚠aggregator source | **PARTIAL** | Series D $250M / B Capital matched but DATE IS NULL (seedtable). Series E Jun 16 2026 Ripple undisclosed matched exactly (TechCrunch). Circle Ventures matched as 'Series E-II' Jul 7 2026 (multiples.vc). Earlier rounds (C $170M, B $35M, A, seed) NOT_IN_GROUND_T… |
| key_products | Payments infra; RLUSD / XRP Ledger / Ripple Payments; stablecoin with Polygon Labs (Oct 2025); Send App; Mono … | ["Payments infrastructure and tools for businesses and banks", "Fintech and payments platforms", "Send App (re… | www.linkedin.com  | **PARTIAL** | Enriched is generic ('payments infrastructure', 'fintech platforms', 'Send App'); misses Ripple/RLUSD rails, Polygon stablecoin, Mono acquisition. Description also carries stale LinkedIn stats ('33+ countries', 'close to $2B processed, 25M transactions') that … |
| competitors | null | unknown | —  | **MISSING** | Enriched 'unknown'; reference silent. Obvious candidates (Paystack/Stripe, Interswitch, Paga, Chipper Cash) — coverage gap. |
| recent_news | ["Series E / Ripple Jun 2026", "Mono acquisition early 2026", "Circle Ventures investment", "Polygon stablecoi… | 2026-10-06 v12.flutterwave.com; 2026-09-23 v12.flutterwave.com; 2026-09-15 v12.flutterwave.com; 2026-09-14 flu… | v12.flutterwave.com; v12.flutterwave.com; v12.flutterwave.com; flutterwave.com; www.startupresearcher.com ⚠secondary / low-authority source | **PARTIAL** | 5 items, all dated Sep 12–Oct 6 2026 and URL-sourced, but 4/5 are company-owned (v12.flutterwave.com ×3, flutterwave.com blog) and 3/5 are near-duplicates about the Dangote IPO. None of the reference items appear (most are >90 days old, but the licence news sh… |
| risk_signals | null | ["₦21.2bn POS system glitch (Oct 2023) exposing 9,633 transactions; Abuja Federal High Court vacated a related… | www.fellowpress.com ⚠secondary / low-authority source | **NOT_IN_GROUND_TRUTH** | Specific and plausible (₦21.2bn glitch, Kenya ARA freeze, Ghana suspension Sep 2025, 3rd CFO in 4 years); source fellowpress.com is a low-authority blog. |
| social_sentiment | null | Mixed tone on X and Trustpilot: strong engagement on company/CEO milestone posts, but persistent complaints ab… | www.trustpilot.com  | **NOT_IN_GROUND_TRUTH** | Enriched 'mixed' vs DB sentiment 0.4 'positive' — mild divergence; DB value is seed-based (2026-10-09), not refreshed from this enrichment. |

Round-by-round:

- PARTIAL (date missing, aggregator): GT `2022-02 $250M Series D led by B Capital @ >$3B` ↔ enriched `date null, $250M Series D, B Capital Group (seedtable)`
- MATCH: GT `2026-06-16 Series E, Ripple, undisclosed, @ $3.2B` ↔ enriched `2026-06-16 Undisclosed Series E, Ripple (TechCrunch)`
- MATCH (adds date; aggregator): GT `Circle Ventures strategic (undated in GT)` ↔ enriched `2026-07-07 Undisclosed 'Series E - II', Circle Ventures (multiples.vc)`

**DB row check:** hq 'San Francisco, US' = profile (both drop Lagos). employees 889 = profile. stage claims Series E '$262.75M' (seedtable) vs reference/profile 'undisclosed' — unconfirmed aggregator figure in the DB. sentiment 0.4 positive vs enriched 'mixed'. latest_news polluted by two logos-world.net items dated 2026-10-10.

**Aggregator-flagged URLs (need primary confirmation):**
- https://multiples.vc/private-comps/flutterwave?utm_source=openai
- https://seedtable.com/companies/flutterwave?utm_source=openai

Secondary / low-authority URLs (verify):
- https://www.cointime.ai/project/flutterwave/funding-rounds?utm_source=openai
- https://www.startupresearcher.com/news/flutterwave-powers-digital-access-to-dangote-refinery-ipo
- https://www.fellowpress.com/how-flutterwaves-%E2%82%A621-2bn-glitch-triggered-9633-transactions-and-what-a-new-court-ruling-means/?utm_source=openai

## WRITER — accuracy 80.0%

| Field | Ground truth | Enriched | Source (date) | Verdict | Note |
|---|---|---|---|---|---|
| hq | San Francisco (111 Maiden Ln) | San Francisco, US | www.linkedin.com  | **MATCH** | Same city; street address not captured (no field). |
| founded | 2020 | 2020 | www.linkedin.com  | **MATCH** | Exact. |
| ceo | May Habib | May Habib | www.linkedin.com  | **MATCH** | Exact. |
| founders | ["May Habib (CEO)", "Waseem AlShikh (CTO)"] | ["May Habib", "Waseem Alshikh"] | www.linkedin.com  | **MATCH** | Both names; spelling 'Alshikh' vs 'AlShikh' only. |
| headcount | null | 693 (estimate) | www.linkedin.com  | **NOT_IN_GROUND_TRUTH** | 693 (LinkedIn estimate). |
| total_raised | $326M | $326M | multiples.vc (2024-11-12) ⚠aggregator source | **MATCH** | Exact, and the enriched rounds sum to it ($5M+$21M+$100M+$200M). Sole source is multiples.vc (aggregator) although writer.com's own press release states $326M. |
| last_valuation | $1.9B (Series C, Nov 12 2024) | $1.9B (Nov 2024) | writer.com (2024-11-12)  | **MATCH** | Exact; primary source (writer.com press release). |
| funding_rounds | [{"date": "2024-11-12", "amount": "$200M Series C", "lead": "Premji Invest, Radical Ventures, ICONIQ Growth (c… | 2024-11-12 $200M Series C; ? $5M Seed; ? $21M Series A; ? $100M Series B | aventure.vc; writer.com; writer.com ⚠secondary / low-authority source | **MATCH** | Series C matched exactly (date, amount, three co-leads, primary source). Participant list (incl. B Capital) not carried — schema only has lead_investors. Earlier rounds (seed $5M, A $21M, B $100M) NOT_IN_GROUND_TRUTH, undated, from aventure.vc / writer.com. |
| key_products | Palmyra X6 (Aug 13 2026); governed agent memory (Sep 9 2026); 2026 Enterprise AI adoption survey | ["Palmyra X6 LLM", "Agent Skills and Playbooks", "Enterprise AI agent platform", "Knowledge Graph and brand/st… | writer.com  | **PARTIAL** | Palmyra X6 captured; Agent Skills/Playbooks, agent platform, Knowledge Graph added; 'governed agent memory' (Sep 9 2026) missing. |
| competitors | null | unknown | —  | **MISSING** | Enriched 'unknown'; reference silent. (Jasper, Cohere, Grammarly Business, Copy.ai are obvious.) Perplexity plugin was BLOCKED (not enough credits) for this company, which likely explains thinner coverage. |
| recent_news | ["Palmyra X6 (Aug 13 2026)", "Governed agent memory (Sep 9 2026)", "2026 Enterprise AI adoption survey"] | 2026-08-13 writer.com; 2026-03-25 writer.com; 2026-02-24 writer.com; 2026-02-18 writer.com; 2025-12-02 writer.… | writer.com; writer.com; writer.com; writer.com; writer.com  | **PARTIAL** | 5 items, dated (Dec 2025–Aug 2026), all from writer.com (company-owned, no third-party). Palmyra X6 (Aug 13) matches the reference; governed agent memory (Sep 9 2026) is missing even though the DB latest_news has the Yahoo article; adoption survey appears only… |
| risk_signals | null | ["High/enterprise pricing seen as overkill for small teams and individuals", "Steep learning curve and setup c… | go.writer.com  | **NOT_IN_GROUND_TRUTH** | Weak as risk signals — two are product-review complaints (price, learning curve) and two are statistics from Writer's own survey, not company risks. |
| social_sentiment | null | Low-volume, company-led discussion on X (@Get_Writer, ~7,600 followers) with minimal engagement and little org… | x.com  | **NOT_IN_GROUND_TRUTH** | 'Low-volume, company-led' consistent with DB sentiment 0.1 neutral. |

Round-by-round:

- MATCH: GT `2024-11-12 $200M Series C @ $1.9B, co-led Premji/Radical/ICONIQ` ↔ enriched `2024-11-12 $200M Series C, Premji Invest/Radical Ventures/ICONIQ Growth (writer.com)`

**DB row check:** hq = profile; employees 693 = profile; status private OK; sentiment 0.1 neutral consistent with enriched 'low-volume'.

**Aggregator-flagged URLs (need primary confirmation):**
- https://multiples.vc/private-comps/writer?utm_source=openai

Secondary / low-authority URLs (verify):
- https://aventure.vc/companies/writer-san-francisco-ca-us/fundraising?utm_source=openai
