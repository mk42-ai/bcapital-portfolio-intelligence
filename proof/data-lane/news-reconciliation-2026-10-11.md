# News reconciliation — 2026-10-11 (computed from news_items, generated 2026-10-11T10:06:45.815Z)

Definition used by `/news/summary` (= `news_total` on /health and /companies): count(*) of news_items rows belonging to a listed company (orphans excluded), de-duplicated by (company_slug, url).
Windows: 30 d = published_at ≥ 2026-09-11, 7 d = published_at ≥ 2026-10-04; undated rows (678) fall outside both windows.
Companies in DB: 137; companies with ≥1 news row: 137; orphan rows (company_slug not in companies): 0 .

## Focus companies + totals

| company | raw | deduped(url) | deduped(title) | in-window-30d | in-window-7d | no-url | definition used by /news/summary |
|---|---|---|---|---|---|---|---|
| aimotive | 19 | 19 | 18 | 8 | 2 | 0 | 19 |
| apptronik | 33 | 33 | 32 | 0 | 0 | 0 | 33 |
| fervo-energy | 37 | 37 | 37 | 17 | 5 | 0 | 37 |
| flutterwave | 38 | 38 | 38 | 7 | 3 | 0 | 38 |
| writer | 23 | 23 | 16 | 0 | 0 | 0 | 23 |
| perplexity-ai | 34 | 34 | 29 | 8 | 5 | 0 | 34 |
| **all 137 (listed companies)** | 2100 | 2100 | 1952 | 244 | 108 | 0 | 2100 |
| **all rows incl. orphans** | 2100 | 2100 | 1952 | 244 | 108 | 0 | 2100 |

## The three figures the owner saw

| figure | what it was | now | verdict |
|---|---|---|---|
| **2,104 raw** | Σ `/companies/{slug}/news?limit=1000` before de-dup | raw rows now **2100**; `/news/summary.total` = **2100** | Σ /companies/{slug}/news?limit=1000 before de-dup = raw news_items rows of listed companies; 2104 was the pre-dedupe count, scripts/dedupe-news.ts removed the exact duplicates (see proof/data-lane/news-dedupe.json) |
| **182** | legacy `latest_news` embedded count | Σ len(latest_news) over /companies = **2037** (observed per-company cap **25**, code cap 25) | does NOT reproduce from latest_news (cap 25/company → Σ 2037); 182 matches the chat-plugin directory page count, not a news count |
| **150 = 19+33+37+38+23** | inspector per-company news_count for aimotive, apptronik, fervo-energy, flutterwave, writer | aimotive 19 + apptronik 33 + fervo-energy 37 + flutterwave 38 + writer 23 = **150** | sums to 150 — reproduces exactly under the /news/summary rule |

## All companies

| company | raw | deduped(url) | deduped(title) | in-window-30d | in-window-7d | no-url | definition used by /news/summary |
|---|---|---|---|---|---|---|---|
| 1au | 19 | 19 | 19 | 1 | 1 | 0 | 19 |
| 6sense | 13 | 13 | 13 | 0 | 0 | 0 | 13 |
| accacia | 30 | 30 | 29 | 4 | 1 | 0 | 30 |
| aimotive | 19 | 19 | 18 | 8 | 2 | 0 | 19 |
| apptronik | 33 | 33 | 32 | 0 | 0 | 0 | 33 |
| archimetis | 13 | 13 | 10 | 1 | 1 | 0 | 13 |
| artbio | 16 | 16 | 15 | 0 | 0 | 0 | 16 |
| aurora-yaocheng | 25 | 25 | 25 | 3 | 2 | 0 | 25 |
| axiom | 20 | 20 | 20 | 3 | 2 | 0 | 20 |
| b-capital | 1 | 1 | 1 | 0 | 0 | 0 | 1 |
| baichuan | 18 | 18 | 13 | 3 | 2 | 0 | 18 |
| bhanzu | 21 | 21 | 21 | 0 | 0 | 0 | 21 |
| branch-international | 23 | 23 | 23 | 2 | 1 | 0 | 23 |
| brik | 31 | 31 | 29 | 3 | 1 | 0 | 31 |
| buildops | 17 | 17 | 17 | 2 | 1 | 0 | 17 |
| cadence | 10 | 10 | 10 | 0 | 0 | 0 | 10 |
| carrick | 11 | 11 | 11 | 0 | 0 | 0 | 11 |
| carro | 8 | 8 | 8 | 0 | 0 | 0 | 8 |
| centivo | 15 | 15 | 8 | 2 | 0 | 0 | 15 |
| certn | 11 | 11 | 6 | 1 | 1 | 0 | 11 |
| chipagents | 14 | 14 | 14 | 1 | 0 | 0 | 14 |
| cloudwise | 26 | 26 | 19 | 1 | 0 | 0 | 26 |
| code-metal | 20 | 20 | 20 | 1 | 1 | 0 | 20 |
| coindcx | 20 | 20 | 18 | 0 | 0 | 0 | 20 |
| collinear-ai | 10 | 10 | 10 | 2 | 1 | 0 | 10 |
| companycam | 15 | 15 | 10 | 1 | 0 | 0 | 15 |
| curbwaste | 18 | 18 | 17 | 0 | 0 | 0 | 18 |
| dailyhunt | 28 | 28 | 28 | 1 | 1 | 0 | 28 |
| deferred | 28 | 28 | 28 | 5 | 0 | 0 | 28 |
| dream-labs | 23 | 23 | 23 | 2 | 1 | 0 | 23 |
| eeroq | 16 | 16 | 16 | 0 | 0 | 0 | 16 |
| eureka-robotics | 20 | 20 | 19 | 0 | 0 | 0 | 20 |
| evenup | 17 | 17 | 17 | 3 | 0 | 0 | 17 |
| evidation-health | 14 | 14 | 13 | 0 | 0 | 0 | 14 |
| evommune | 17 | 17 | 17 | 4 | 1 | 0 | 17 |
| extend | 8 | 8 | 8 | 0 | 0 | 0 | 8 |
| falconx | 12 | 12 | 6 | 0 | 0 | 0 | 12 |
| fervo-energy | 37 | 37 | 37 | 17 | 5 | 0 | 37 |
| figment | 16 | 16 | 16 | 1 | 0 | 0 | 16 |
| floor-nfts | 22 | 22 | 22 | 0 | 0 | 0 | 22 |
| flourish-health | 16 | 16 | 15 | 0 | 0 | 0 | 16 |
| flowgpt | 28 | 28 | 28 | 4 | 3 | 0 | 28 |
| flutterwave | 38 | 38 | 38 | 7 | 3 | 0 | 38 |
| forest | 11 | 11 | 10 | 4 | 3 | 0 | 11 |
| fountain | 11 | 11 | 11 | 2 | 0 | 0 | 11 |
| gable | 10 | 10 | 9 | 0 | 0 | 0 | 10 |
| goodfire | 16 | 16 | 15 | 6 | 5 | 0 | 16 |
| goose | 15 | 15 | 15 | 1 | 0 | 0 | 15 |
| grace-investment-machine | 13 | 13 | 12 | 0 | 0 | 0 | 13 |
| graymatter-robotics | 18 | 18 | 10 | 0 | 0 | 0 | 18 |
| grit | 21 | 21 | 21 | 2 | 0 | 0 | 21 |
| gushwork | 13 | 13 | 13 | 4 | 4 | 0 | 13 |
| havocai | 14 | 14 | 12 | 1 | 0 | 0 | 14 |
| heylibby | 11 | 11 | 11 | 1 | 0 | 0 | 11 |
| hifibio | 8 | 8 | 8 | 0 | 0 | 0 | 8 |
| hotspot-therapeutics | 12 | 12 | 11 | 0 | 0 | 0 | 12 |
| hypersonix | 5 | 5 | 5 | 0 | 0 | 0 | 5 |
| icertis | 14 | 14 | 12 | 1 | 1 | 0 | 14 |
| infrahub | 19 | 19 | 14 | 2 | 0 | 0 | 19 |
| innovaccer | 16 | 16 | 16 | 1 | 0 | 0 | 16 |
| insilico-medicine | 21 | 21 | 20 | 1 | 0 | 0 | 21 |
| inspace | 19 | 19 | 19 | 2 | 0 | 0 | 19 |
| iru | 8 | 8 | 7 | 6 | 2 | 0 | 8 |
| isaac-health | 14 | 14 | 6 | 0 | 0 | 0 | 14 |
| jetzero | 12 | 12 | 12 | 0 | 0 | 0 | 12 |
| judi-rx | 14 | 14 | 14 | 0 | 0 | 0 | 14 |
| karman-industries | 9 | 9 | 9 | 0 | 0 | 0 | 9 |
| khatabook | 17 | 17 | 17 | 4 | 4 | 0 | 17 |
| knox | 23 | 23 | 21 | 9 | 7 | 0 | 23 |
| kopi-kenangan | 14 | 14 | 14 | 3 | 1 | 0 | 14 |
| labelbox | 22 | 22 | 22 | 3 | 1 | 0 | 22 |
| labviva | 11 | 11 | 10 | 0 | 0 | 0 | 11 |
| lambda | 15 | 15 | 15 | 4 | 4 | 0 | 15 |
| levelten | 13 | 13 | 12 | 1 | 0 | 0 | 13 |
| linkmore | 15 | 15 | 15 | 2 | 0 | 0 | 15 |
| lively | 9 | 9 | 9 | 1 | 0 | 0 | 9 |
| lumara-health | 9 | 9 | 9 | 0 | 0 | 0 | 9 |
| lunar-energy | 18 | 18 | 17 | 1 | 1 | 0 | 18 |
| macrolux | 16 | 16 | 13 | 1 | 1 | 0 | 16 |
| meditrust | 25 | 25 | 24 | 1 | 1 | 0 | 25 |
| meesho | 16 | 16 | 16 | 6 | 4 | 0 | 16 |
| miotech | 13 | 13 | 13 | 0 | 0 | 0 | 13 |
| mswipe | 12 | 12 | 12 | 1 | 0 | 0 | 12 |
| nalu | 14 | 14 | 13 | 0 | 0 | 0 | 14 |
| nektar-ai | 15 | 15 | 13 | 2 | 0 | 0 | 15 |
| nest-genomics | 8 | 8 | 4 | 0 | 0 | 0 | 8 |
| neushen-therapeutics | 23 | 23 | 23 | 2 | 1 | 0 | 23 |
| ninja-van | 27 | 27 | 27 | 0 | 0 | 0 | 27 |
| numerion-labs | 12 | 12 | 12 | 4 | 1 | 0 | 12 |
| nuvig | 13 | 13 | 6 | 2 | 2 | 0 | 13 |
| odeko | 9 | 9 | 9 | 0 | 0 | 0 | 9 |
| omnidian | 9 | 9 | 9 | 1 | 1 | 0 | 9 |
| oro-labs | 12 | 12 | 12 | 2 | 1 | 0 | 12 |
| overstory | 10 | 10 | 9 | 1 | 0 | 0 | 10 |
| palebluedot | 16 | 16 | 7 | 7 | 2 | 0 | 16 |
| payfazz | 21 | 21 | 21 | 1 | 1 | 0 | 21 |
| pendo | 12 | 12 | 12 | 0 | 0 | 0 | 12 |
| percent | 15 | 15 | 12 | 4 | 1 | 0 | 15 |
| perimeter-81 | 9 | 9 | 9 | 0 | 0 | 0 | 9 |
| perplexity-ai | 34 | 34 | 29 | 8 | 5 | 0 | 34 |
| phenom-people | 13 | 13 | 13 | 2 | 0 | 0 | 13 |
| picnichealth | 11 | 11 | 10 | 0 | 0 | 0 | 11 |
| poolside | 13 | 13 | 13 | 0 | 0 | 0 | 13 |
| positive-development | 11 | 11 | 11 | 3 | 0 | 0 | 11 |
| precision-neuro | 10 | 10 | 10 | 4 | 1 | 0 | 10 |
| profoundbio | 18 | 18 | 18 | 4 | 3 | 0 | 18 |
| rapyd | 12 | 12 | 6 | 0 | 0 | 0 | 12 |
| reflection | 24 | 24 | 24 | 13 | 12 | 0 | 24 |
| remote | 17 | 17 | 11 | 1 | 0 | 0 | 17 |
| rona-therapeutics | 9 | 9 | 8 | 0 | 0 | 0 | 9 |
| seltz | 11 | 11 | 11 | 3 | 0 | 0 | 11 |
| sharpa | 17 | 17 | 17 | 3 | 0 | 0 | 17 |
| shipday | 16 | 16 | 16 | 2 | 1 | 0 | 16 |
| sift-healthcare | 10 | 10 | 10 | 1 | 0 | 0 | 10 |
| silvercloud-health | 9 | 9 | 9 | 0 | 0 | 0 | 9 |
| solar-square | 16 | 16 | 15 | 0 | 0 | 0 | 16 |
| solve-therapeutics | 9 | 9 | 9 | 0 | 0 | 0 | 9 |
| sonilo | 11 | 11 | 11 | 4 | 2 | 0 | 11 |
| spectrumedics | 15 | 15 | 15 | 1 | 1 | 0 | 15 |
| star-catcher | 11 | 11 | 11 | 4 | 2 | 0 | 11 |
| starburst-data | 11 | 11 | 11 | 1 | 1 | 0 | 11 |
| sugarfit | 9 | 9 | 9 | 0 | 0 | 0 | 9 |
| synapticure | 11 | 11 | 10 | 0 | 0 | 0 | 11 |
| tacta | 10 | 10 | 10 | 1 | 0 | 0 | 10 |
| tinyhealth | 12 | 12 | 12 | 5 | 0 | 0 | 12 |
| trm-labs | 8 | 8 | 8 | 0 | 0 | 0 | 8 |
| turbine | 9 | 9 | 9 | 2 | 0 | 0 | 9 |
| turno | 13 | 13 | 13 | 0 | 0 | 0 | 13 |
| unblocked-brands | 9 | 9 | 9 | 0 | 0 | 0 | 9 |
| vivacta | 14 | 14 | 14 | 1 | 0 | 0 | 14 |
| volastra | 7 | 7 | 7 | 0 | 0 | 0 | 7 |
| when | 6 | 6 | 6 | 0 | 0 | 0 | 6 |
| wildfire | 8 | 8 | 8 | 0 | 0 | 0 | 8 |
| writer | 23 | 23 | 16 | 0 | 0 | 0 | 23 |
| xingyun | 12 | 12 | 12 | 1 | 0 | 0 | 12 |
| yalo | 11 | 11 | 10 | 0 | 0 | 0 | 11 |
| zaihui | 16 | 16 | 15 | 0 | 0 | 0 | 16 |
