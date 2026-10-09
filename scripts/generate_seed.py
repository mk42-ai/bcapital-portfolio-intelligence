#!/usr/bin/env python3
"""Generate data/seed.json from the B Capital brand matrix XLSX + the intelligence JSON.

Usage: python3 scripts/generate_seed.py [data/brand-matrix.xlsx] [data/seed.json]
Produces exactly 135 Brand_Matrix rows + 1 B Capital firm record (= 136 spec records),
plus 1 intelligence-only focus record (Flutterwave, absent from the matrix) flagged
in_brand_matrix=false. Every unknown financial field is an explicit 'ESTIMATE:'.
"""
import json, re, sys, datetime, unicodedata
import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else "data/brand-matrix.xlsx"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/seed.json"
NOW = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
RESEARCH_TS = "2026-10-09"

def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s

def clean(v):
    if v is None: return None
    v = str(v).strip()
    if v in ("", "Missing", "—", "-", "None"): return None
    return v

def split_list(v, sep=";"):
    v = clean(v)
    if not v: return []
    return [x.strip() for x in v.split(sep) if x.strip() and x.strip() not in ("—", "Missing")]

HEX = re.compile(r"#[0-9A-Fa-f]{6}")
def first_hex(v):
    v = clean(v)
    if not v: return None
    m = HEX.search(v); return m.group(0).upper() if m else None

def bg_text(v):
    v = clean(v)
    if not v: return (None, None)
    bg = re.search(r"bg\s*(#[0-9A-Fa-f]{6})", v); tx = re.search(r"text\s*(#[0-9A-Fa-f]{6})", v)
    return (bg.group(1).upper() if bg else None, tx.group(1).upper() if tx else None)

SECTOR_MAP = {"Technology & AI": "Technology", "Energy": "Energy & Resilience", "Healthcare": "Healthcare", "Opportunistic": "Opportunistic"}

# ---- Intelligence JSON (research_timestamp 2026-10-09) -----------------------------------
INTEL = {
 "Perplexity": {"name":"Perplexity AI","slug":"perplexity-ai","status":"private","hq":"San Francisco, CA","employees":1370,"sector":"Technology","region":"North America","stage":"Series E (latest $20B valuation Sep 2025)","b_capital_role":"participant","b_capital_round":"Series D Dec 2024 ($500M at $9B post, w/ SoftBank, T. Rowe Price)","estimated_ticket_size_usd":50000000,"estimated_ownership_pct":0.5,"estimate_confidence":"medium","estimate_rationale":"ESTIMATE: Non-lead participant in $500M Series D at $9B post; ~10% allocation ($50M) ≈0.56% then diluted by Series E ($14B) and $20B raise; flagged estimate","brand":{"guidelines_url":"https://live.standards.site/perplexity/","designer":"Smith & Diction"},"sources":["https://perplexityaimagazine.com/perplexity-hub/perplexity-ai-funding-history/","https://multiples.vc/private-comps/perplexity","https://spyvc.com/companies/perplexity","https://tsginvest.com/perplexity-ai/"],"reddit_signal":"negative: complaints about Computer-mode credits, scheduled tasks removal, billing support, model limits (r/perplexity_ai Oct 2026)","seed_sentiment":{"score":-0.35,"label":"negative","evidence":[{"url":"https://www.reddit.com/r/perplexity_ai/","quote":"taking out scheduled searches even for legacy customers? that's not even on par with what competitors like ChatGPT and Muse are offering."},{"url":"https://perplexityaimagazine.com/perplexity-hub/perplexity-ai-funding-history/","quote":"latest $20B valuation Sep 2025"}]},"latest_news":[{"title":"Perplexity valued at $20B in Sep 2025 raise","url":"https://perplexityaimagazine.com/perplexity-hub/perplexity-ai-funding-history/","published_at":"2025-09-30","source":"perplexityaimagazine.com"},{"title":"r/perplexity_ai: complaints over Computer-mode credits, scheduled-task removal and billing support (Oct 2026)","url":"https://www.reddit.com/r/perplexity_ai/","published_at":"2026-10-01","source":"reddit.com"}]},
 "Apptronik": {"name":"Apptronik","slug":"apptronik","status":"private","hq":"Austin, TX","employees":300,"sector":"Technology","region":"North America","stage":"Series A-X ($520M ext Feb 11 2026, total Series A $935M, post-money ~$5.3B)","b_capital_role":"lead","b_capital_round":"Lead $350M Series A Feb 2025, co-lead $53M close Mar 2025, co-lead $520M A-X Feb 2026 (Ascent Fund III)","b_capital_fund":"Ascent Fund III","estimated_ticket_size_usd":200000000,"estimated_ownership_pct":4.0,"estimate_confidence":"medium","estimate_rationale":"ESTIMATE: Lead allocation 10-20% across $935M of rounds ≈$120-200M; ÷ $5.3B post ≈3-5%; flagged estimate","brand":{"designer":"argodesign","voice":"Robots for Humans","product_mark":"Apollo™"},"sources":["https://apptronik.com/news-collection/apptronik-closes-over-935-million-series-a","https://techcrunch.com/2026/02/11/humanoid-robot-startup-apptronik-has-now-raised-935m-at-a-5b-valuation/"],"reddit_signal":"neutral-positive humanoid robotics enthusiasm, no Apptronik-specific threads","seed_sentiment":{"score":0.3,"label":"positive","evidence":[{"url":"https://apptronik.com/news-collection/apptronik-closes-over-935-million-series-a","quote":"Apptronik Closes Over $935 Million Series A with New $520 Million Extension Round"},{"url":"https://techcrunch.com/2026/02/11/humanoid-robot-startup-apptronik-has-now-raised-935m-at-a-5b-valuation/","quote":"has now raised $935M at a $5B valuation"}]},"latest_news":[{"title":"Apptronik closes over $935M Series A with new $520M extension","url":"https://apptronik.com/news-collection/apptronik-closes-over-935-million-series-a","published_at":"2026-02-11","source":"apptronik.com"}]},
 "Fervo Energy": {"name":"Fervo Energy","slug":"fervo-energy","status":"public (Nasdaq: FRVO)","ticker":"Nasdaq: FRVO","hq":"Houston, TX","employees":199,"sector":"Energy & Resilience","region":"North America","stage":"IPO 2026-05-14 at $27/share, ~$2.17B proceeds, ~$10.1B mkt cap; PM mark ~$20.2B Sep 2026","b_capital_role":"lead","b_capital_round":"Lead $462M Series E Dec 10 2025 at ~$1.4B post","estimated_ticket_size_usd":462000000,"estimated_ownership_pct":2.0,"estimate_confidence":"low","estimate_rationale":"ESTIMATE: Led Series E; not listed among >5% holders in S-1/424B4 so <5%, likely 1-3%; flagged estimate","latest_news":[{"title":"First Power at Cape Station","url":"https://finance.yahoo.com/energy/articles/fervo-hits-first-power-cape-120500060.html","published_at":"2026-09-24","source":"finance.yahoo.com"},{"title":"Commercial operation at Cape Station","url":"https://fervoenergy.com/","published_at":"2026-10-01","source":"fervoenergy.com"},{"title":"Phase II 400MW targeted 2028","url":"https://www.sec.gov/Archives/edgar/data/1853868/000162828026035311/fervo-8xkmay2026.htm","published_at":"2026-05-14","source":"sec.gov"}],"sources":["https://fervoenergy.com/fervo-energy-announces-pricing-of-its-upsized-initial-public-offering/","https://www.sec.gov/Archives/edgar/data/1853868/000162828026035311/fervo-8xkmay2026.htm","https://finance.yahoo.com/energy/articles/fervo-hits-first-power-cape-120500060.html"],"seed_sentiment":{"score":0.6,"label":"positive","evidence":[{"url":"https://finance.yahoo.com/energy/articles/fervo-hits-first-power-cape-120500060.html","quote":"Fervo hits first power at Cape Station"},{"url":"https://fervoenergy.com/fervo-energy-announces-pricing-of-its-upsized-initial-public-offering/","quote":"pricing of its upsized initial public offering"}]}},
 "Flutterwave": {"name":"Flutterwave","slug":"flutterwave","status":"private","hq":"San Francisco, CA / Lagos","employees":884,"sector":"Technology","region":"Africa / North America","stage":"Series E Jun 16 2026 ($262.75M at $3.2B, Ripple Ventures); Series E-II Circle Ventures Jul 2026","b_capital_role":"lead","b_capital_round":"Lead $250M Series D Feb 16 2022 at >$3B post","estimated_ticket_size_usd":50000000,"estimated_ownership_pct":5.0,"estimate_confidence":"medium","estimate_rationale":"ESTIMATE: Lead 15-25% of $250M ≈$37-60M; diluted by Series E; flagged estimate","brand":{"press_kit":"https://flutterwave.com/us/press-kit","primary":"#FB9129"},"website":"https://flutterwave.com","sources":["https://www.prnewswire.com/news-releases/flutterwave-closes-usd-250m-in-series-d-funding-valuation-rises-to-over-usd-3bn-301483531.html","https://seedtable.com/companies/flutterwave"],"seed_sentiment":{"score":0.4,"label":"positive","evidence":[{"url":"https://seedtable.com/companies/flutterwave","quote":"Series E Jun 16 2026 ($262.75M at $3.2B)"},{"url":"https://www.prnewswire.com/news-releases/flutterwave-closes-usd-250m-in-series-d-funding-valuation-rises-to-over-usd-3bn-301483531.html","quote":"Flutterwave Closes USD $250m in Series D Funding, Valuation Rises to Over USD $3bn"}]},"latest_news":[{"title":"Flutterwave raises $262.75M Series E at $3.2B (Ripple Ventures)","url":"https://seedtable.com/companies/flutterwave","published_at":"2026-06-16","source":"seedtable.com"},{"title":"Series E-II extension with Circle Ventures","url":"https://seedtable.com/companies/flutterwave","published_at":"2026-07-15","source":"seedtable.com"}]},
 "Writer": {"name":"WRITER","slug":"writer","status":"private","hq":"San Francisco, CA","employees":600,"sector":"Technology","region":"North America","stage":"Series C Nov 12 2024 ($200M at $1.9B)","b_capital_role":"participant","b_capital_round":"Participant Series A Nov 2021 ($21M) and Series C","estimated_ticket_size_usd":5000000,"estimated_ownership_pct":1.5,"estimate_confidence":"medium","estimate_rationale":"ESTIMATE: Non-lead 2-3% of Series A and C ≈$5-7M; flagged estimate","brand":{"guidelines_url":"https://writer.com/newsroom/","primary":"#5551FE","naming":"all caps WRITER"},"sources":["https://writer.com/blog/series-c-funding-writer-press-release/","https://forgeglobal.com/writer_ipo/"],"seed_sentiment":{"score":0.1,"label":"neutral","evidence":[{"url":"https://writer.com/blog/series-c-funding-writer-press-release/","quote":"WRITER raises $200M Series C at $1.9B valuation to fuel leadership in agentic enterprise AI"}]},"latest_news":[{"title":"WRITER raises $200M Series C at $1.9B valuation","url":"https://writer.com/blog/series-c-funding-writer-press-release/","published_at":"2024-11-12","source":"writer.com"}]},
}
STATUS_CHANGES = [
 {"company":"Capital Rx","new_name":"Judi Rx","parent":"Judi Health","effective":"2026-07-15","change":"renamed Judi Rx (parent Judi Health)"},
 {"company":"Synack","change":"merged into NetSPI","closed":"2026-10-05"},
 {"company":"Fervo Energy","change":"public Nasdaq:FRVO","date":"2026-05-14"},
 {"company":"Meesho","change":"IPO NSE/BSE at ₹111, listed 2025-12-10","date":"2025-12-10"},
 {"company":"Code Metal","change":"unicorn, $125M Series B at $1.25B led by Salesforce Ventures with B Capital participating","date":"2026-02-19"},
 {"company":"BlackBuck","change":"public","date":None},
 {"company":"Geek+","change":"public","date":None},
 {"company":"Bird","change":"public","date":None},
]
ANON = {"Star Catcher":"co-led seed, led $65M Series A","6sense":"AI revenue platform","Accacia":"AI carbon accounting","Archimetis":"thyristor memory ~$11.5M Feb 2026","ARTBIO":"co-led $132M Series B Jul 2025","Axiom":"AI reasoning engine","Baichuan":"foundational AI Asia (medium)","HotSpot Therapeutics":"Healthcare Fund I"}
ROLE_OVERRIDES = {"Star Catcher":"lead","ARTBIO":"co-lead","Code Metal":"participant"}
FUND_OVERRIDES = {"HotSpot Therapeutics":"Healthcare Fund I","Apptronik":"Ascent Fund III"}

def default_estimate(name, sector, role, note=None):
    """Explicit flagged estimate derived from B Capital's typical ticket by role; never blank."""
    if name == "Archimetis":
        return 1500000, 4.0, "low", "ESTIMATE: ~$11.5M round (Feb 2026); role unknown → participant share 2-5% of round is too small for a VC ticket, assume ~13% of round ≈$1.5M; ownership ≈4% at an assumed ~$40M post; flagged estimate"
    if name == "ARTBIO":
        return 30000000, 5.0, "low", "ESTIMATE: co-led $132M Series B (Jul 2025); co-lead ≈15-25% of round → $20-33M, midpoint $30M; ownership ≈5% at an assumed ~$600M post; flagged estimate"
    if name == "Star Catcher":
        return 15000000, 8.0, "low", "ESTIMATE: co-led seed and led $65M Series A; lead ≈15-25% of $65M → $10-16M; ownership ≈8% at an assumed ~$200M post; flagged estimate"
    if name == "Code Metal":
        return 6000000, 0.5, "low", "ESTIMATE: participant in $125M Series B at $1.25B (Feb 2026, Salesforce Ventures lead); participant ≈2-5% of round → $2.5-6M; ownership ≈0.5%; flagged estimate"
    if role == "lead":
        return 40000000, 10.0, "low", "ESTIMATE: role lead; B Capital lead tickets ≈15-25% of a $150-250M growth round → ~$40M; ownership ≈8-12% at a typical post-money; no verified round data; flagged estimate"
    return 15000000, 3.0, "low", f"ESTIMATE: role unknown → assumed participant (2-5% of a typical $150-400M growth round ≈ $5-20M, midpoint $15M); ownership ≈2-5% (midpoint 3%); no verified round data in the brand matrix; flagged estimate{(' — ' + note) if note else ''}"

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb["Brand_Matrix"]
hdr = [c.value for c in ws[1]]
rows = [dict(zip(hdr, r)) for r in ws.iter_rows(min_row=2, values_only=True) if r[0]]
assert len(rows) == 135, len(rows)

# Screenshot index (for screenshot_url) if present
companies = []
for i, r in enumerate(rows, start=1):
    name = r["Company"].strip()
    intel = INTEL.get(name)
    display = intel["name"] if intel else name
    slug = intel["slug"] if intel else slugify(name)
    sector_raw = r["Sector"]; sector = SECTOR_MAP.get(sector_raw, sector_raw)
    region = r["Region"]
    bg, tx = bg_text(r["Background/Text Hex"])
    fonts = split_list(r["Font Families"])
    tier = clean(r["Evidence Tier"]) or "Missing"
    primary = first_hex(r["Primary Hex"])
    secondaries = [h.upper() for h in HEX.findall(clean(r["Secondary Hexes"]) or "")]
    brand_tokens = {"primary": primary, "secondary": secondaries[0] if secondaries else None, "secondary_all": secondaries, "background": bg, "text": tx, "fonts": fonts, "evidence_tier": tier, "guideline_url": clean(r["Guideline Doc URL"]), "completeness_pct": round(float(r["Completeness %"] or 0) * 100)}
    if intel and intel.get("brand"): brand_tokens["intel"] = intel["brand"]
    status = "private"
    stage = None
    news = []
    for sc in STATUS_CHANGES:
        if sc["company"] == name:
            if name == "Capital Rx":
                display = "Judi Rx"; slug = "judi-rx"; status = "private — renamed Judi Rx (parent Judi Health) effective 2026-07-15"
            elif name == "Fervo Energy": status = "public (Nasdaq: FRVO)"
            elif name == "Meesho": status = "public (NSE/BSE, listed 2025-12-10 at ₹111)"
            elif name == "Code Metal": status = "private — unicorn ($1.25B Series B, 2026-02-19)"
            news.append({"id": f"seed-status-{slug}", "title": f"Status change: {sc['change']}", "url": "https://b.capital/portfolio/", "published_at": sc.get("date") or sc.get("effective") or sc.get("closed") or RESEARCH_TS, "source": "intelligence_json", "kind": "status_change"})
    role = ROLE_OVERRIDES.get(name, "unknown")
    fund = FUND_OVERRIDES.get(name)
    if intel:
        status = intel["status"]; stage = intel["stage"]; role = intel["b_capital_role"]; fund = intel.get("b_capital_fund", fund)
        ticket, own, conf, rationale = intel["estimated_ticket_size_usd"], intel["estimated_ownership_pct"], intel["estimate_confidence"], intel["estimate_rationale"]
        for n in intel.get("latest_news", []):
            news.append({"id": f"seed-{slug}-{slugify(n['title'])[:40]}", "kind": "news", **n})
        sent = intel["seed_sentiment"]
    else:
        ticket, own, conf, rationale = default_estimate(name, sector, role, ANON.get(name))
        sent = {"score": 0.0, "label": "neutral", "evidence": []}
    sources = split_list(r["Source URLs"], ";")
    if intel: sources = list(dict.fromkeys(sources + intel.get("sources", [])))
    rec = {
        "id": i, "name": display, "matrix_name": name, "slug": slug, "sector": sector, "sector_raw": sector_raw, "region": intel["region"] if intel else region,
        "stage": stage, "status": status, "website": clean(r["Website"]) or (intel or {}).get("website"), "linkedin_url": clean(r["LinkedIn"]),
        "hq": (intel or {}).get("hq") or clean(r["HQ"]), "employees": (intel or {}).get("employees"),
        "logo_url": (split_list(r["Logo URLs"]) or [None])[0], "brand_tokens": brand_tokens,
        "b_capital_fund": fund, "b_capital_role": role, "b_capital_round": (intel or {}).get("b_capital_round"),
        "estimated_ticket_size_usd": ticket, "estimated_ownership_pct": own, "estimate_confidence": conf, "estimate_rationale": rationale,
        "latest_news": news, "sentiment": {"score": sent["score"], "label": sent["label"], "evidence": sent["evidence"], "updated_at": NOW, "basis": "seed (intelligence JSON research_timestamp 2026-10-09)" if intel else "seed placeholder — not yet scored by workflow"},
        "sources": sources, "screenshot_ref": clean(r["Evidence Screenshot URL"]), "anon_resolution": ANON.get(name), "is_focus": bool(intel), "in_brand_matrix": True, "last_checked": str(r["Last Checked"]) if r["Last Checked"] else None,
    }
    companies.append(rec)

# Record 136: B Capital firm
companies.append({
  "id": 136, "name": "B Capital", "matrix_name": "B Capital", "slug": "b-capital", "sector": "Venture Capital (firm)", "sector_raw": "Firm", "region": "North America",
  "stage": "Firm — $12B+ AUM; Ascent Fund III closed at $500M", "status": "firm", "website": "https://b.capital", "linkedin_url": "https://www.linkedin.com/company/b-capital-group",
  "hq": "Manhattan Beach, CA (9 global locations)", "employees": 65, "logo_url": "https://b.capital/wp-content/uploads/2023/10/BCapital_Logo_XL.png",
  "brand_tokens": {"primary": "#0AC985", "secondary": "#12ABCF", "accent": "#FAAB3D", "background": "#0A211A", "text": "#FFFFFF", "fonts": ["Reckless Neue", "Yellix"], "evidence_tier": "Verified", "guideline_url": "https://b.capital", "tagline": "We empower entrepreneurs to think bigger. Scale faster. Grow global.", "identity": "Catalysts. Questioners. Visionaries.", "values": ["Generosity", "Resilience", "Open-mindedness", "Will", "Teamwork", "Humility"]},
  "b_capital_fund": None, "b_capital_role": "firm", "b_capital_round": None, "estimated_ticket_size_usd": None, "estimated_ownership_pct": None, "estimate_confidence": "high", "estimate_rationale": "Not applicable — this record is the firm itself (18 partners, ~65 staff, $12B+ AUM).",
  "latest_news": [{"id": "seed-b-capital-ascent-iii", "kind": "news", "title": "Ascent Fund III closed at $500M", "url": "https://b.capital/", "published_at": "2026-01-01", "source": "b.capital"}, {"id": "seed-b-capital-cai", "kind": "news", "title": "Dr. Andrew Jackson named GP & Chief AI Officer", "url": "https://b.capital/", "published_at": "2026-07-23", "source": "b.capital"}],
  "sentiment": {"score": 0.2, "label": "positive", "evidence": [{"url": "https://b.capital/", "quote": "Ascent Fund III closed at $500M"}], "updated_at": NOW, "basis": "seed"},
  "sources": ["https://b.capital", "https://b.capital/portfolio/"], "screenshot_ref": "b-capital-portfolio-brand-evidence-screenshots.zip/b-capital.jpg", "anon_resolution": None, "is_focus": False, "in_brand_matrix": False, "last_checked": NOW,
})
# Record 137 (extra, flagged): Flutterwave — focus company in the intelligence JSON but absent from the 135-row Brand_Matrix
fw = INTEL["Flutterwave"]
companies.append({
  "id": 137, "name": fw["name"], "matrix_name": None, "slug": fw["slug"], "sector": fw["sector"], "sector_raw": "Technology & AI", "region": fw["region"],
  "stage": fw["stage"], "status": fw["status"], "website": fw["website"], "linkedin_url": "https://www.linkedin.com/company/flutterwave", "hq": fw["hq"], "employees": fw["employees"],
  "logo_url": None, "brand_tokens": {"primary": "#FB9129", "secondary": None, "background": None, "text": None, "fonts": [], "evidence_tier": "Third-party", "guideline_url": "https://flutterwave.com/us/press-kit"},
  "b_capital_fund": None, "b_capital_role": fw["b_capital_role"], "b_capital_round": fw["b_capital_round"], "estimated_ticket_size_usd": fw["estimated_ticket_size_usd"], "estimated_ownership_pct": fw["estimated_ownership_pct"], "estimate_confidence": fw["estimate_confidence"], "estimate_rationale": fw["estimate_rationale"],
  "latest_news": [{"id": f"seed-flutterwave-{slugify(n['title'])[:40]}", "kind": "news", **n} for n in fw["latest_news"]],
  "sentiment": {"score": fw["seed_sentiment"]["score"], "label": fw["seed_sentiment"]["label"], "evidence": fw["seed_sentiment"]["evidence"], "updated_at": NOW, "basis": "seed (intelligence JSON research_timestamp 2026-10-09)"},
  "sources": fw["sources"], "screenshot_ref": None, "anon_resolution": None, "is_focus": True, "in_brand_matrix": False, "last_checked": NOW,
  "note": "NOT in the 135-row Brand_Matrix; added from the intelligence JSON focus list so the bcap-focus-daily workflow has a write-back target.",
})

names = {c["matrix_name"] for c in companies}
unmatched = [sc for sc in STATUS_CHANGES if sc["company"] not in names]
seed = {
  "generated_at": NOW, "source_xlsx": SRC, "research_timestamp": RESEARCH_TS,
  "counts": {"brand_matrix_rows": 135, "firm_records": 1, "spec_records": 136, "extra_focus_records": 1, "total": len(companies)},
  "companies": companies,
  "status_changes": [{**sc, "matched": sc["company"] in names} for sc in STATUS_CHANGES],
  "unmatched_status_changes": [sc["company"] for sc in unmatched],
}
json.dump(seed, open(OUT, "w"), indent=1, ensure_ascii=False)
slugs = [c["slug"] for c in companies]
assert len(slugs) == len(set(slugs)), "duplicate slugs"
print(json.dumps({"total": len(companies), "spec_records": 136, "unmatched_status_changes": seed["unmatched_status_changes"], "focus": [c["slug"] for c in companies if c["is_focus"]]}))
