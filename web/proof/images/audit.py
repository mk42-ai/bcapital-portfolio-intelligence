#!/usr/bin/env python3
"""Agent 01 image audit: logos + news thumbnails. Read-only against backend."""
import json, csv, time, ssl, socket, sys, urllib.request, urllib.error, http.client
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse
from collections import Counter, defaultdict
from datetime import datetime, timezone

BASE = "https://sb-70og0c82gysn.vercel.run"
OUT = "/tmp/wt-images/web/proof/images"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"
CAP = 2500
ctx = ssl.create_default_context()

def api(path, timeout=30):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return json.load(r)

t0 = time.time()
companies = api("/companies?limit=200")["data"]
firm_rows = [c for c in companies if (c.get("b_capital_role") == "firm" or c.get("slug") in ("b-capital",) or "b capital" == (c.get("name") or "").lower())]
cos = [c for c in companies if c not in firm_rows]
print(f"companies={len(companies)} firm_rows={[c['slug'] for c in firm_rows]} non-firm={len(cos)}", file=sys.stderr)

# inventory: url -> record
inv = {}   # url -> dict(kind, slug, domain, source)
news_total_items = 0
news_missing = []   # items with no image_url (slug, url present?)
logo_missing = []
latest_news_urls = set()

for c in cos:
    lu = c.get("logo_url")
    if not lu:
        logo_missing.append(c["slug"])
    elif lu not in inv:
        inv[lu] = {"kind": "logo", "slug": c["slug"], "domain": urlparse(lu).netloc.lower(), "source": None}
    for n in c.get("latest_news") or []:
        if n.get("image_url"):
            latest_news_urls.add(n["image_url"])

def fetch_news(c):
    slug = c["slug"]
    try:
        d = api(f"/companies/{slug}/news?limit=100")
        return slug, d.get("data") or [], None
    except Exception as e:
        return slug, [], repr(e)

news_errors = {}
with ThreadPoolExecutor(max_workers=8) as ex:
    for slug, items, err in ex.map(fetch_news, cos):
        if err:
            news_errors[slug] = err
        for n in items:
            news_total_items += 1
            iu = n.get("image_url")
            if not iu:
                news_missing.append({"slug": slug, "url": n.get("url"), "source": n.get("source"), "has_article_url": bool(n.get("url"))})
                continue
            if iu not in inv:
                inv[iu] = {"kind": "news", "slug": slug, "domain": urlparse(iu).netloc.lower(), "source": n.get("source"), "article_url": n.get("url")}
print(f"inventory unique urls={len(inv)} news_items={news_total_items} news_missing={len(news_missing)} logo_missing={len(logo_missing)} news_api_errors={len(news_errors)} t={time.time()-t0:.0f}s", file=sys.stderr)

urls = list(inv.keys())
if len(urls) > CAP:
    logos = [u for u in urls if inv[u]["kind"] == "logo"]
    news = [u for u in urls if inv[u]["kind"] != "logo"]
    urls = logos + news[: CAP - len(logos)]
    print(f"capped to {len(urls)}", file=sys.stderr)

class NoRedirectLoop(Exception): pass

def do_req(url, method):
    req = urllib.request.Request(url, method=method, headers={
        "User-Agent": UA, "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"})
    r = urllib.request.urlopen(req, timeout=8, context=ctx)
    body = b"" if method == "HEAD" else r.read(65536)
    return r.status, r.headers.get("Content-Type", "") or "", len(body), r.geturl()

def probe(url):
    rec = {"url": url, "status": None, "content_type": "", "bytes": 0, "ms": 0, "class": "other", "final_url": None, "error": ""}
    if url.lower().startswith("http://"):
        rec["class"] = "mixed_content"
    t = time.time()
    try:
        try:
            st, ct, nb, fu = do_req(url, "HEAD")
            if not ct.lower().startswith("image/"):
                st, ct, nb, fu = do_req(url, "GET")
        except urllib.error.HTTPError as e:
            if e.code in (405, 403, 404, 401, 400, 501):
                st, ct, nb, fu = do_req(url, "GET")
            else:
                raise
        rec.update(status=st, content_type=ct, bytes=nb, final_url=fu)
        if 200 <= st < 300:
            if ct.lower().startswith("image/") or (ct == "" and nb > 0):
                if rec["class"] != "mixed_content":
                    rec["class"] = "ok"
            else:
                rec["class"] = "bad_content_type"
    except urllib.error.HTTPError as e:
        rec["status"] = e.code
        rec["content_type"] = e.headers.get("Content-Type", "") if e.headers else ""
        if e.code == 404 or e.code == 410:
            rec["class"] = "404"
        elif e.code in (401, 403):
            rec["class"] = "403_hotlink"
        elif e.code == 429:
            rec["class"] = "rate_limited"
        elif e.code >= 500:
            rec["class"] = "server_5xx"
        else:
            rec["class"] = f"http_{e.code}"
        rec["error"] = str(e)
    except urllib.error.URLError as e:
        reason = e.reason
        rec["error"] = repr(reason)
        if isinstance(reason, (socket.timeout, TimeoutError, ConnectionRefusedError, ConnectionResetError)) or "timed out" in str(reason) or "refused" in str(reason) or "reset" in str(reason):
            rec["class"] = "cors_or_blocked"
        elif isinstance(reason, socket.gaierror) or "Name or service" in str(reason) or "nodename" in str(reason) or "getaddrinfo" in str(reason):
            rec["class"] = "dns_fail"
        elif isinstance(reason, ssl.SSLError) or "SSL" in str(reason) or "CERTIFICATE" in str(reason):
            rec["class"] = "ssl_error"
        else:
            rec["class"] = "other"
    except (socket.timeout, TimeoutError, ConnectionResetError, ConnectionRefusedError, http.client.RemoteDisconnected, http.client.IncompleteRead) as e:
        rec["error"] = repr(e); rec["class"] = "cors_or_blocked"
    except Exception as e:
        rec["error"] = repr(e)
        if "redirect" in str(e).lower() or "Too many" in str(e):
            rec["class"] = "redirect_loop"
        else:
            rec["class"] = "other"
    rec["ms"] = int((time.time() - t) * 1000)
    return rec

results = {}
with ThreadPoolExecutor(max_workers=16) as ex:
    futs = {ex.submit(probe, u): u for u in urls}
    done = 0
    for f in as_completed(futs):
        r = f.result(); results[r["url"]] = r; done += 1
        if done % 200 == 0:
            print(f"probed {done}/{len(urls)} t={time.time()-t0:.0f}s", file=sys.stderr)

# ---- aggregate ----
rows = []
for u in urls:
    m = inv[u]; r = results[u]
    rows.append({"kind": m["kind"], "slug": m["slug"], "url": u, "status": r["status"], "content_type": r["content_type"],
                 "class": r["class"], "domain": m["domain"], "bytes": r["bytes"], "ms": r["ms"], "error": r["error"], "source": m.get("source"),
                 "article_url": m.get("article_url"), "final_url": r["final_url"]})
# missing rows
for s in logo_missing:
    rows.append({"kind": "logo", "slug": s, "url": "", "status": None, "content_type": "", "class": "missing", "domain": "", "bytes": 0, "ms": 0, "error": "", "source": None, "article_url": None, "final_url": None})
for nm in news_missing:
    rows.append({"kind": "news", "slug": nm["slug"], "url": "", "status": None, "content_type": "", "class": "missing", "domain": urlparse(nm["url"] or "").netloc.lower(), "bytes": 0, "ms": 0, "error": "", "source": nm["source"], "article_url": nm["url"], "final_url": None})

def summarize(kind):
    rs = [r for r in rows if r["kind"] == kind]
    cls = Counter(r["class"] for r in rs)
    broken = {k: v for k, v in cls.items() if k != "ok"}
    return {"total": len(rs), "ok": cls.get("ok", 0), "broken": sum(broken.values()), "broken_by_class": dict(sorted(broken.items(), key=lambda x: -x[1]))}

logos_s = summarize("logo"); news_s = summarize("news")
combined = Counter(r["class"] for r in rows if r["class"] != "ok")

dom = defaultdict(Counter)
for r in rows:
    if r["class"] != "ok" and r["domain"]:
        dom[r["domain"]][r["class"]] += 1
top_dom = sorted(({"domain": d, "count": sum(c.values()), "class": c.most_common(1)[0][0], "classes": dict(c)} for d, c in dom.items()), key=lambda x: -x["count"])[:25]

fails = [r for r in rows if r["class"] != "ok"]
sample = [{k: r[k] for k in ("kind", "slug", "url", "status", "content_type", "class", "domain", "error")} for r in fails[:20]]

# per-slug news breakdown + flutterwave detail
per_slug = defaultdict(Counter)
for r in rows:
    if r["kind"] == "news":
        per_slug[r["slug"]][r["class"]] += 1
fw = [r for r in rows if r["slug"] == "flutterwave"]
# latest_news (home/News Pulse feed) subset status
pulse = [results[u] for u in latest_news_urls if u in results]
pulse_cls = Counter(p["class"] for p in pulse)

out = {
    "generated_utc": datetime.now(timezone.utc).isoformat(),
    "backend": BASE,
    "companies_total_rows": len(companies), "firm_rows_excluded": [c["slug"] for c in firm_rows], "companies_audited": len(cos),
    "news_items_total": news_total_items, "news_unique_image_urls": sum(1 for u in inv if inv[u]["kind"] == "news"),
    "news_api_errors": news_errors,
    "total": len(rows), "probed_unique_urls": len(urls), "capped": len(inv) > CAP,
    "logos": logos_s, "news": news_s,
    "broken_by_class": dict(sorted(combined.items(), key=lambda x: -x[1])),
    "news_pulse_latest_news_subset": {"unique_urls": len(latest_news_urls), "by_class": dict(pulse_cls)},
    "top_failing_domains": top_dom,
    "sample_failures": sample,
    "per_company_news_breakdown": {s: dict(c) for s, c in sorted(per_slug.items())},
    "flutterwave": [{k: r[k] for k in ("kind", "url", "status", "content_type", "class", "domain", "bytes", "error", "final_url", "source")} for r in fw],
    "elapsed_s": round(time.time() - t0, 1),
}
with open(f"{OUT}/image_audit_before.json", "w") as f:
    json.dump(out, f, indent=1)
with open(f"{OUT}/image_audit_before.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["kind", "slug", "url", "status", "content_type", "class", "domain", "bytes", "ms"], extrasaction="ignore")
    w.writeheader(); w.writerows(rows)
with open(f"{OUT}/image_audit_before_full.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)

print(json.dumps({k: out[k] for k in ("total", "probed_unique_urls", "news_items_total", "logos", "news", "broken_by_class", "news_pulse_latest_news_subset", "elapsed_s")}, indent=1))
print("TOP DOMAINS:"); [print(" ", d["count"], d["domain"], d["classes"]) for d in top_dom[:12]]
print("FLUTTERWAVE:"); [print(" ", r["kind"], r["class"], r["status"], r["content_type"][:40], r["url"][:110], r["error"][:80]) for r in fw]
