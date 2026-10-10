#!/usr/bin/env python3
"""Asset pipeline: /tmp/assets-src/<name>.png (1024² RGB on white) → public/assets/<name>-{256,512}.{webp,png} with a transparent background.
White→alpha: near-white pixels connected to the image border are background (flood via connected components); an edge band gets a soft alpha
from its luminance so anti-aliased outlines keep a clean rim. White INSIDE shapes (e.g. a card face) stays opaque. Deterministic, no network."""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/assets-src"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets")
NAMES = ["news-card", "company-logo", "financial-empty", "voice-orb-idle", "voice-orb-listening", "upload-dropzone",
         "awaiting-input", "require-creds", "browser-action", "synced-badge", "new-chat", "voice-orb-thinking"]
os.makedirs(OUT, exist_ok=True)
manifest = {}
for name in NAMES:
    im = Image.open(os.path.join(SRC, f"{name}.png")).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    mn = a.min(axis=2)                      # darkest channel: 255 = pure white
    near_white = mn >= 232
    lab, n = ndimage.label(near_white)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border != 0])
    # soft rim: pixels within 2 px of the background get alpha from how far they are from white
    rim = ndimage.binary_dilation(bg, iterations=2) & ~bg
    alpha = np.full(mn.shape, 255, dtype=np.uint8)
    alpha[bg] = 0
    alpha[rim] = np.clip((255 - mn[rim]) * 255 // 60, 0, 255).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    full = Image.fromarray(rgba, "RGBA")
    # trim transparent margins (keep square aspect so icons share one box)
    ys, xs = np.where(alpha > 8)
    pad = 24
    y0, y1, x0, x1 = max(ys.min() - pad, 0), min(ys.max() + pad, alpha.shape[0]), max(xs.min() - pad, 0), min(xs.max() + pad, alpha.shape[1])
    side = max(y1 - y0, x1 - x0); cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    box = (max(cx - side // 2, 0), max(cy - side // 2, 0)); box = (box[0], box[1], min(box[0] + side, alpha.shape[1]), min(box[1] + side, alpha.shape[0]))
    full = full.crop(box)
    entry = {}
    for size in (256, 512):
        r = full.resize((size, size), Image.LANCZOS)
        for ext in ("webp", "png"):
            p = os.path.join(OUT, f"{name}-{size}.{ext}")
            r.save(p, **({"quality": 86, "method": 6} if ext == "webp" else {"optimize": True}))
            entry[f"{ext}{size}"] = f"/assets/{name}-{size}.{ext}"
    pct = float(bg.mean() * 100)
    manifest[name] = {**entry, "transparent_pct": round(pct, 1)}
    print(f"{name:20s} bg {pct:5.1f}%  crop {box}")
with open(os.path.join(OUT, "manifest.json"), "w") as f: json.dump(manifest, f, indent=2)
print("wrote", len(manifest), "assets →", os.path.abspath(OUT))
