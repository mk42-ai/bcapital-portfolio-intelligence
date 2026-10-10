#!/usr/bin/env python3
"""Parse timestamped raw SSE logs (turnN.raw.log) into summary.json + summarisation-candidates.json."""
import json, re, os, collections

OUT = os.path.dirname(os.path.abspath(__file__))
CAP = 4000
INTEREST = re.compile(r"summar|history|plan|step|agent|status", re.I)
SUMMAR = re.compile(r"summar", re.I)
ERRORS = re.compile(r"Not enough credits|Internal server error", re.I)


def parse_frames(path):
    frames, cur = [], None
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.rstrip("\n")
        if "\t" not in line:
            continue
        ms_s, rest = line.split("\t", 1)
        ms = int(ms_s)
        if rest == "":
            if cur:
                frames.append(cur)
            cur = None
            continue
        if cur is None:
            cur = {"ms": ms, "event": None, "data": [], "raw": []}
        cur["raw"].append(rest)
        if rest.startswith("event:"):
            cur["event"] = rest[6:].strip()
        elif rest.startswith("data:"):
            cur["data"].append(rest[5:].strip())
    if cur:
        frames.append(cur)
    for f in frames:
        f["data_text"] = "\n".join(f["data"])
        f["raw_text"] = "\n".join(f["raw"])
        f["json"] = None
        if f["data_text"] and f["data_text"] != "[DONE]":
            try:
                f["json"] = json.loads(f["data_text"])
            except Exception:
                pass
    return frames


def status_type(j):
    if not isinstance(j, dict):
        return None
    csl = j.get("currentStatusLog")
    if isinstance(csl, dict) and csl.get("statusType"):
        return csl["statusType"]
    return j.get("statusType")


def cap(s):
    return s if len(s) <= CAP else s[:CAP] + f"...[truncated {len(s)-CAP} chars]"


def payload_of(f):
    return f["json"] if f["json"] is not None and len(f["data_text"]) <= CAP else cap(f["data_text"] or f["raw_text"])


summary = {"session": json.load(open(os.path.join(OUT, "session.json")))["data"]["id"], "turns": {}}
candidates = []

for n in (1, 2):
    meta = json.load(open(os.path.join(OUT, f"turn{n}.meta.json")))
    frames = parse_frames(os.path.join(OUT, f"turn{n}.raw.log"))
    ev_names = collections.Counter(f["event"] or "(none)" for f in frames)
    ev_types = collections.Counter()
    st_types = collections.Counter()
    first_answer_ms = done_ms = None
    sources_count = 0
    sources_frames = 0
    interesting, errors = [], []
    seen_interest_types = collections.Counter()
    for f in frames:
        j = f["json"]
        et = j.get("eventType") if isinstance(j, dict) else None
        if et:
            ev_types[et] += 1
        st = status_type(j)
        if st:
            st_types[st] += 1
        if f["data_text"] == "[DONE]" and done_ms is None:
            done_ms = f["ms"]
        if isinstance(j, dict):
            if et == "fulfillment" and j.get("answer") and first_answer_ms is None:
                first_answer_ms = f["ms"]
            if et == "plugin_sources":
                sources_frames += 1
                items = (j.get("sources") or {}).get("items") or []
                sources_count += len(items)
        probe_text = f"{et or ''} {st or ''} {f['raw_text']}"
        # exclude token deltas (thinking / fulfillment) whose *content* merely mentions the words
        content_only = et in ("fulfillment", "planning_thinking", "thinking", "step_thinking", "fulfillment_thinking")
        if INTEREST.search(probe_text) and not content_only:
            interesting.append({"ms": f["ms"], "event": f["event"], "eventType": et, "statusType": st, "payload": payload_of(f)})
            seen_interest_types[f"{f['event']}/{et}/{st}"] += 1
        if ERRORS.search(f["raw_text"]):
            errors.append({"ms": f["ms"], "event": f["event"], "eventType": et, "payload": payload_of(f)})
        if SUMMAR.search(probe_text):
            candidates.append({"turn": n, "turn_ms": f["ms"], "event": f["event"], "eventType": et, "statusType": st,
                               "content_token_only": content_only, "payload": payload_of(f)})
    # count of thinking/fulfillment deltas whose text matched the interest regex (reported but not listed)
    content_matches = sum(1 for f in frames if INTEREST.search(f["raw_text"]) and isinstance(f["json"], dict)
                          and f["json"].get("eventType") in ("fulfillment", "planning_thinking", "thinking", "step_thinking", "fulfillment_thinking"))
    summary["turns"][f"turn{n}"] = {
        "start_utc": meta["start_utc"], "end_utc": meta["end_utc"], "total_ms": meta["total_ms"],
        "frame_count": len(frames),
        "first_frame_ms": frames[0]["ms"] if frames else None,
        "first_answer_ms": first_answer_ms, "done_ms": done_ms,
        "distinct_event_names": dict(ev_names),
        "distinct_eventTypes": dict(ev_types),
        "distinct_statusTypes": dict(st_types),
        "plugin_sources_frames": sources_frames, "sources_count": sources_count,
        "interesting_frame_groups": dict(seen_interest_types),
        "interesting_frames_note": "token-delta frames (thinking/fulfillment) whose text merely mentions plan/step/etc. are excluded; count=" + str(content_matches),
        "interesting_frames": interesting,
        "error_frames": errors,
    }

with open(os.path.join(OUT, "summary.json"), "w") as fh:
    json.dump(summary, fh, indent=2)
cand_doc = {"found": bool(candidates), "note": ("" if candidates else "No frame in either turn matched /summar/i — no summarize_history / summarisation statusLog frame was emitted upstream."),
            "frames": candidates}
with open(os.path.join(OUT, "summarisation-candidates.json"), "w") as fh:
    json.dump(cand_doc, fh, indent=2)

for n in (1, 2):
    t = summary["turns"][f"turn{n}"]
    print(f"turn{n}: frames={t['frame_count']} total_ms={t['total_ms']} first_frame={t['first_frame_ms']} first_answer={t['first_answer_ms']} done={t['done_ms']} sources={t['sources_count']}")
    print("  event names:", t["distinct_event_names"])
    print("  eventTypes :", t["distinct_eventTypes"])
    print("  statusTypes:", t["distinct_statusTypes"])
    print("  interest groups:", t["interesting_frame_groups"])
    print("  errors:", len(t["error_frames"]))
print("summar candidates:", len(candidates), [(c["turn"], c["eventType"], c["content_token_only"]) for c in candidates])
