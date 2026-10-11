#!/usr/bin/env python3
"""icon-qa.py — QA the step-4 glyph PNG sources (web/public/icons/glyphs-src/*.png) against the icon spec.

Spec (per glyph): 1024px square, transparent or white background, charcoal #1F2937 ink drawn at ~2px stroke @ 24px
(i.e. ~85px @ 1024), exactly ONE connected #0AC985 accent region, and no other hue (no blue — brand audit).

Measured per PNG (pure PIL + stdlib, no numpy):
  * size                        — WxH
  * background_ratio            — share of pixels that are transparent (alpha < 16) or near-white
  * background_kind             — "transparent" | "white" | "mixed"
  * dominant_ink                — most common quantised non-background, non-accent colour, + RGB distance to #1F2937
  * accent_share_pct            — % of non-background pixels within RGB euclidean distance 40 of #0AC985
  * accent_components           — connected components (4-neighbour flood fill) of the accent mask on a 128px downscale
  * single_accent               — accent_components == 1
  * stroke_px_at_24             — median horizontal run length of ink pixels (full res) / 42.67 (1024 → 24 scale)
  * other_hue                   — True if a meaningful share of ink pixels is a saturated hue that is neither charcoal nor the accent
  * pass / failures             — spec: stroke 1.6–2.6 px@24, accent_components == 1, no other hue

Usage:  python3 web/scripts/icon-qa.py [--src web/public/icons/glyphs-src] [--out web/public/icons/glyph-qa.json]
Prints a table and writes the JSON report consumed by icon-manifest.json.
"""
from __future__ import annotations

import argparse
import colorsys
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

INK = (0x1F, 0x29, 0x37)
ACCENT = (0x0A, 0xC9, 0x85)
ACCENT_DIST = 40
STROKE_MIN, STROKE_MAX = 1.6, 2.6
SCALE_24 = 1024 / 24  # 42.67 px @1024 == 1 px @24


def dist(a, b) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def is_background(px) -> bool:
    r, g, b, a = px
    return a < 16 or (r > 238 and g > 238 and b > 238)


def hue_sat(rgb):
    h, s, v = colorsys.rgb_to_hsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    return h * 360, s, v


def components(mask: list[list[bool]]) -> int:
    """4-neighbour flood fill component count on a boolean grid."""
    h = len(mask)
    w = len(mask[0]) if h else 0
    seen = [[False] * w for _ in range(h)]
    n = 0
    for y in range(h):
        for x in range(w):
            if mask[y][x] and not seen[y][x]:
                n += 1
                stack = [(y, x)]
                seen[y][x] = True
                while stack:
                    cy, cx = stack.pop()
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((ny, nx))
    return n


def qa_png(path: Path) -> dict:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()

    total = w * h
    bg = transparent = white = 0
    ink_pixels = 0
    accent_pixels = 0
    colour_counter: Counter = Counter()
    other_hue_pixels = 0
    runs: list[int] = []

    for y in range(h):
        run = 0
        for x in range(w):
            p = px[x, y]
            if is_background(p):
                bg += 1
                if p[3] < 16:
                    transparent += 1
                else:
                    white += 1
                if run:
                    runs.append(run)
                    run = 0
                continue
            rgb = p[:3]
            if dist(rgb, ACCENT) <= ACCENT_DIST:
                accent_pixels += 1
                if run:
                    runs.append(run)
                    run = 0
                continue
            # anti-aliased edge pixels blend towards white; count as ink but only quantise solid ones
            ink_pixels += 1
            run += 1
            hh, ss, vv = hue_sat(rgb)
            if vv < 0.6:  # solid-ish ink
                colour_counter[(rgb[0] // 8 * 8, rgb[1] // 8 * 8, rgb[2] // 8 * 8)] += 1
            # brand-audit rule: a "foreign hue" is saturated AND chromatic (sat>0.15, chroma>0.15) and not the accent/charcoal.
            chroma = (max(rgb) - min(rgb)) / 255
            if ss > 0.15 and chroma > 0.15 and dist(rgb, INK) > 60:
                other_hue_pixels += 1
        if run:
            runs.append(run)

    non_bg = total - bg
    dominant = colour_counter.most_common(1)[0][0] if colour_counter else None
    dom_hex = "#%02X%02X%02X" % dominant if dominant else None
    dom_dist = round(dist(dominant, INK), 1) if dominant else None

    # accent components on 128px downscale (box filter keeps thin accents visible)
    small = im.resize((128, 128), Image.BOX)
    sp = small.load()
    mask = [[(not is_background(sp[x, y])) and dist(sp[x, y][:3], ACCENT) <= ACCENT_DIST + 15 for x in range(128)] for y in range(128)]
    comps = components(mask)

    # stroke estimate: median horizontal ink run (ignore 1-2 px AA slivers and very long fills)
    useful = [r for r in runs if 4 <= r <= 400]
    stroke_1024 = statistics.median(useful) if useful else 0.0
    stroke_24 = round(stroke_1024 / SCALE_24, 2)

    other_hue = (other_hue_pixels / max(1, ink_pixels)) > 0.02

    # informative only: the drawings do not fill the 1024 canvas, so also express the stroke relative to the ink bbox
    # fitted into a 20px box (Lucide's 24px frame minus 2px padding) — i.e. what the stroke would be after re-framing.
    bbox = im.convert("L").point(lambda v: 255 if v < 200 else 0).getbbox() or (0, 0, w, h)
    bbox_span = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
    stroke_24_reframed = round(stroke_1024 / (bbox_span / 20), 2) if bbox_span else 0.0
    failures = []
    if not (STROKE_MIN <= stroke_24 <= STROKE_MAX):
        failures.append(f"stroke {stroke_24}px@24 outside {STROKE_MIN}-{STROKE_MAX}")
    if comps != 1:
        failures.append(f"accent components {comps} != 1")
    if other_hue:
        failures.append("other hue present")
    if (w, h) != (1024, 1024):
        failures.append(f"size {w}x{h} != 1024x1024")

    return {
        "name": path.stem,
        "file": str(path.as_posix()),
        "size": [w, h],
        "background_ratio": round(bg / total, 4),
        "background_kind": "transparent" if transparent > white * 4 else ("white" if white > transparent * 4 else "mixed"),
        "dominant_ink": dom_hex,
        "dominant_ink_distance_to_1F2937": dom_dist,
        "ink_is_charcoal": bool(dom_dist is not None and dom_dist <= 40),
        "accent_share_pct": round(100 * accent_pixels / max(1, non_bg), 2),
        "accent_components": comps,
        "single_accent": comps == 1,
        "stroke_px_at_1024": round(stroke_1024, 1),
        "stroke_px_at_24": stroke_24,
        "ink_bbox": list(bbox),
        "stroke_px_at_24_reframed_to_20px_box": stroke_24_reframed,
        "other_hue": other_hue,
        "other_hue_pct_of_ink": round(100 * other_hue_pixels / max(1, ink_pixels), 2),
        "pass": not failures,
        "failures": failures,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parents[1]
    ap.add_argument("--src", default=str(root / "public/icons/glyphs-src"))
    ap.add_argument("--out", default=str(root / "public/icons/glyph-qa.json"))
    args = ap.parse_args()
    src = Path(args.src)
    files = sorted(src.glob("*.png"))
    if not files:
        print(f"no PNGs in {src}", file=sys.stderr)
        return 1
    report = [qa_png(f) for f in files]
    for r in report:
        r["file"] = str(Path(r["file"]).relative_to(root.parent)) if str(root.parent) in r["file"] else r["file"]
    out = {
        "spec": {"size": 1024, "ink": "#1F2937", "accent": "#0AC985", "stroke_px_at_24": [STROKE_MIN, STROKE_MAX], "accent_components": 1, "other_hue": False},
        "glyphs": report,
        "summary": {"total": len(report), "pass": sum(1 for r in report if r["pass"]), "fail": sum(1 for r in report if not r["pass"])},
    }
    Path(args.out).write_text(json.dumps(out, indent=2) + "\n")
    print(f"{'name':16} {'size':10} {'bg':>6} {'ink':8} {'acc%':>6} {'comp':>4} {'stroke@24':>9} {'reframed':>8}  result")
    for r in report:
        print(f"{r['name']:16} {'x'.join(map(str, r['size'])):10} {r['background_ratio']:6.3f} {str(r['dominant_ink']):8} {r['accent_share_pct']:6.2f} {r['accent_components']:4d} {r['stroke_px_at_24']:9.2f} {r['stroke_px_at_24_reframed_to_20px_box']:8.2f}  {'PASS' if r['pass'] else 'FAIL: ' + '; '.join(r['failures'])}")
    print(f"→ {args.out}  ({out['summary']['pass']}/{out['summary']['total']} pass)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
