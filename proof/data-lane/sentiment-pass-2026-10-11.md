# Sentiment pass 2 — 2026-10-11 (rule:news-mean-v1 over the STORED corpus only)

The owner's step-2 web search returned **zero sources** (empty `sourcesWithContent`) for all five company queries, so this pass uses only `news_items` already in the backend DB — no article was fabricated.

| run | base | ingest_run_id | run_at | companies | rules R1/R2/R3 | null delta before → after |
|---|---|---|---|---|---|---|
| local | http://localhost:4795 | `ing-2026-10-11T100803Z-42fde1` | 2026-10-11T10:08:03.634Z | 137 | 129/0/8 | 1 → **0** (of 137) |
| live | https://sb-23wo7xiys7fz.vercel.run | `ing-2026-10-11T100811Z-ffd690` | 2026-10-11T10:08:11.568Z | 137 | 129/0/8 | 1 → **0** (of 137) |

Company with a null delta before the pass: `b-capital` (single sentiment_history row). After the pass every one of the 137 companies has a non-null delta, locally and on the live backend.

## Focus companies (+ perplexity-ai) — live backend read-back

| company | score | delta vs prior | prior score | prior_run_at | scored_at (live) | scored_at (local seed) | rule | items used |
|---|---|---|---|---|---|---|---|---|
| aimotive | 0.56 | +0.00 | 0.56 | 2026-10-11T07:10:24Z | 2026-10-11T10:08:11Z | 2026-10-11T10:08:03Z | R1 news-mean (latest<=20, non-null sentiment_score) | 5 |
| apptronik | 0.54 | +0.00 | 0.54 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | 2026-10-11T10:08:03Z | R1 news-mean (latest<=20, non-null sentiment_score) | 5 |
| fervo-energy | 0.35 | +0.00 | 0.35 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | 2026-10-11T10:08:03Z | R1 news-mean (latest<=20, non-null sentiment_score) | 4 |
| flutterwave | 0.44 | +0.00 | 0.44 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | 2026-10-11T10:08:03Z | R1 news-mean (latest<=20, non-null sentiment_score) | 5 |
| writer | 0.52 | +0.00 | 0.52 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | 2026-10-11T10:08:03Z | R1 news-mean (latest<=20, non-null sentiment_score) | 5 |
| perplexity-ai | 0.34 | +0.00 | 0.34 | 2026-10-11T00:46:31Z | 2026-10-11T10:08:11Z | 2026-10-11T10:08:03Z | R1 news-mean (latest<=20, non-null sentiment_score) | 5 |

Deltas are 0 for the six: the rule is deterministic and no new scored news arrived since the 07:10Z pass (R1 mean unchanged). `prior_run_at` is the previous `sentiment_history.recorded_at` (00:46Z run for the five original focus companies, 07:10Z run for aimotive and the other 131), `scored_at` is this run's row.

## All companies (live run)

| company | score | delta | prior_run_at | rule | items |
|---|---|---|---|---|---|
| 1au | 0.2 | 0 | 2026-10-11T07:10:24Z | R1 | 3 |
| 6sense | 0.48 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| accacia | 0.62 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| aimotive | 0.56 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| apptronik | 0.54 | 0 | 2026-10-11T00:46:31Z | R1 | 5 |
| archimetis | 0.58 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| artbio | 0.4 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| aurora-yaocheng | 0.5667 | 0 | 2026-10-11T07:10:24Z | R1 | 3 |
| axiom | 0.55 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| b-capital | 0.2 | 0 | 2026-10-09T12:24:23Z | R3 | 0 |
| baichuan | -0.12 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| bhanzu | -0.625 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| branch-international | 0.0667 | 0 | 2026-10-11T07:10:24Z | R1 | 3 |
| brik | 0.4 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| buildops | 0.68 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| cadence | 0.65 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| carrick | 0.575 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| carro | 0 | 0 | 2026-10-11T07:10:24Z | R3 | 0 |
| centivo | 0.38 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| certn | 0.58 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| chipagents | 0.8 | 0 | 2026-10-11T07:10:24Z | R1 | 1 |
| cloudwise | 0.55 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| code-metal | 0.64 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| coindcx | 0.24 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| collinear-ai | 0.32 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| companycam | 0.425 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| curbwaste | 0.62 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| dailyhunt | -0.3 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| deferred | 0.58 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| dream-labs | 0.65 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| eeroq | 0.8 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| eureka-robotics | 0.7 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| evenup | 0.72 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| evidation-health | 0.4 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| evommune | 0.26 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| extend | 0.46 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| falconx | 0.58 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| fervo-energy | 0.35 | 0 | 2026-10-11T00:46:31Z | R1 | 4 |
| figment | 0.65 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| floor-nfts | 0.325 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| flourish-health | 0.76 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| flowgpt | 0.16 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| flutterwave | 0.44 | 0 | 2026-10-11T00:46:31Z | R1 | 5 |
| forest | 0.65 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| fountain | 0.46 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| gable | 0.72 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| goodfire | 0.6 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| goose | 0.38 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| grace-investment-machine | 0.44 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| graymatter-robotics | 0.56 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| grit | 0.45 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| gushwork | 0.4 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| havocai | 0.72 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| heylibby | 0.56 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| hifibio | 0.65 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| hotspot-therapeutics | 0.58 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| hypersonix | 0 | 0 | 2026-10-11T07:10:24Z | R3 | 0 |
| icertis | 0.24 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| infrahub | 0 | 0 | 2026-10-11T07:10:24Z | R3 | 0 |
| innovaccer | 0.02 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| insilico-medicine | 0.82 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| inspace | 0.72 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| iru | 0.36 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| isaac-health | 0.74 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| jetzero | 0.62 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| judi-rx | 0.52 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| karman-industries | 0.7 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| khatabook | 0.42 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| knox | 0.5 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| kopi-kenangan | 0.46 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| labelbox | 0.4 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| labviva | 0.68 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| lambda | 0.32 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| levelten | 0.72 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| linkmore | 0.8 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| lively | 0.42 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| lumara-health | 0 | 0 | 2026-10-11T07:10:24Z | R3 | 0 |
| lunar-energy | 0.68 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| macrolux | 0.54 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| meditrust | 0.52 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| meesho | 0.48 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| miotech | 0.58 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| mswipe | 0.4 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| nalu | 0.72 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| nektar-ai | 0.5 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| nest-genomics | 0 | 0 | 2026-10-11T07:10:24Z | R3 | 0 |
| neushen-therapeutics | 0.65 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| ninja-van | -0.54 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| numerion-labs | 0.24 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| nuvig | -0.12 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| odeko | 0 | 0 | 2026-10-11T07:10:24Z | R3 | 0 |
| omnidian | 0.3 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| oro-labs | 0.72 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| overstory | 0.72 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| palebluedot | 0.4 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| payfazz | 0.4 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| pendo | 0.04 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| percent | 0.32 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| perimeter-81 | 0.1 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| perplexity-ai | 0.34 | 0 | 2026-10-11T00:46:31Z | R1 | 5 |
| phenom-people | 0.44 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| picnichealth | 0.46 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| poolside | 0.02 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| positive-development | 0.58 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| precision-neuro | 0.63 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| profoundbio | 0.24 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| rapyd | -0.04 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| reflection | 0.5 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| remote | 0.66 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| rona-therapeutics | 0.575 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| seltz | 0.74 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| sharpa | 0.7 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| shipday | 0.52 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| sift-healthcare | 0.02 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| silvercloud-health | 0.4 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| solar-square | 0.64 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| solve-therapeutics | 0.5 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| sonilo | 0.62 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| spectrumedics | 0.56 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| star-catcher | 0.58 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| starburst-data | 0.64 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| sugarfit | 0.375 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| synapticure | 0.84 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| tacta | 0.7333 | 0 | 2026-10-11T07:10:24Z | R1 | 3 |
| tinyhealth | 0.6 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| trm-labs | 0.32 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| turbine | 0.85 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| turno | 0.75 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| unblocked-brands | 0.65 | 0 | 2026-10-11T07:10:24Z | R1 | 2 |
| vivacta | 0.85 | 0 | 2026-10-11T07:10:24Z | R1 | 4 |
| volastra | 0.42 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| when | 0.46 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
| wildfire | 0 | 0 | 2026-10-11T07:10:24Z | R3 | 0 |
| writer | 0.52 | 0 | 2026-10-11T00:46:31Z | R1 | 5 |
| xingyun | 0.1 | 0 | 2026-10-11T07:10:24Z | R1 | 3 |
| yalo | 0.5333 | 0 | 2026-10-11T07:10:24Z | R1 | 3 |
| zaihui | -0.04 | 0 | 2026-10-11T07:10:24Z | R1 | 5 |
