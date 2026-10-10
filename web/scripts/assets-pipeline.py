#!/usr/bin/env python3
"""Asset pipeline: /tmp/assets-src/<name>.png (1024² RGB on white) → public/assets/<name>-{256,512}.{webp,png} with a transparent background.
White→alpha: near-white pixels connected to the image border are background (flood via connected components); an edge band gets a soft alpha
from its luminance so anti-aliased outlines keep a clean rim. White INSIDE shapes (e.g. a card face) stays opaque. Deterministic, no network.

Usage:
  python3 scripts/assets-pipeline.py [SRC_DIR]      # generate 12 × {256,512} × {webp,png} + manifest.json
  python3 scripts/assets-pipeline.py --verify       # no source needed: checks every PNG has alpha-0 borders, no white halo, writes nothing
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets")
NAMES = ["news-card", "company-logo", "financial-empty", "voice-orb-idle", "voice-orb-listening", "upload-dropzone",
         "awaiting-input", "require-creds", "browser-action", "synced-badge", "new-chat", "voice-orb-thinking"]
SIZES = (256, 512)
EXTS = ("webp", "png")


def verify() -> int:
    """Halo check on the emitted PNGs: border pixels must be alpha 0, and no (near-)opaque near-white pixel may touch the transparent region
    (that is what renders as a white rim on tinted surfaces). Interior whites (card faces) are allowed and reported."""
    bad = 0
    for name in NAMES:
        for size in SIZES:
            p = os.path.join(OUT, f"{name}-{size}.png")
            a = np.asarray(Image.open(p).convert("RGBA"))
            al, rgb = a[..., 3], a[..., :3].astype(int)
            border_max = int(np.concatenate([al[0], al[-1], al[:, 0], al[:, -1]]).max())
            trans = al == 0
            edge = ndimage.binary_dilation(trans, iterations=1) & ~trans
            near_white = rgb.min(axis=2) >= 240
            halo = int((edge & near_white & (al >= 200)).sum())
            interior_white = int((near_white & (al == 255) & ~ndimage.binary_dilation(trans, iterations=3)).sum())
            ok = border_max == 0 and halo == 0
            bad += 0 if ok else 1
            print(f"{'ok ' if ok else 'BAD'} {name:20s}{size}  border_alpha_max={border_max:3d}  halo_px={halo:4d}  transparent={trans.mean()*100:5.1f}%  interior_white_px={interior_white}")
    print("verify:", "all clean" if bad == 0 else f"{bad} file(s) with halo/border alpha")
    return 1 if bad else 0


def generate(src: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for name in NAMES:
        im = Image.open(os.path.join(src, f"{name}.png")).convert("RGB")
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
        entry, bytes_ = {}, {}
        for size in SIZES:
            r = full.resize((size, size), Image.LANCZOS)
            for ext in EXTS:
                p = os.path.join(OUT, f"{name}-{size}.{ext}")
                r.save(p, **({"quality": 86, "method": 6} if ext == "webp" else {"optimize": True}))
                entry[f"{ext}{size}"] = f"/assets/{name}-{size}.{ext}"
                bytes_[f"{ext}{size}"] = os.path.getsize(p)
        pct = float((np.asarray(full)[..., 3] == 0).mean() * 100)   # transparent share of the emitted (cropped) image
        manifest[name] = {**entry, "bytes": bytes_, "transparent_pct": round(pct, 1), "source_bg_pct": round(float(bg.mean() * 100), 1)}
        print(f"{name:20s} transparent {pct:5.1f}% (source bg {bg.mean()*100:5.1f}%)  crop {tuple(int(v) for v in box)}")
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2); f.write("\n")
    print("wrote", len(manifest), "assets →", os.path.abspath(OUT))


if __name__ == "__main__":
    if "--verify" in sys.argv[1:]:
        sys.exit(verify())
    generate(sys.argv[1] if len(sys.argv) > 1 else "/tmp/assets-src")
    sys.exit(verify())
