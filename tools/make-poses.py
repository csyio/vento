#!/usr/bin/env python3
"""Crops and slims down the Ebabil poses (assets/mascot/*.png) for the app -> vento/base/content/art/pose-*.webp.

Transparent margins are cropped (3% padding), the longest edge is scaled down to 512 px, output is WebP (alpha kept).
Requires Pillow + numpy (venv). Usage: python3 tools/make-poses.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "vento/base/content/art")
MAX = 512
POSES = {"error": "error", "empty": "empty", "idle": "idle", "icon": "icon"}

os.makedirs(OUT, exist_ok=True)
for name, src in POSES.items():
    im = Image.open(os.path.join(ROOT, f"assets/mascot/{src}.png")).convert("RGBA")
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    pad = int(0.03 * max(im.size))
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad, im.width), min(ys.max() + pad, im.height))
    im = im.crop(box)
    scale = MAX / max(im.size)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    path = os.path.join(OUT, f"pose-{name}.webp")
    im.save(path, "WEBP", quality=88, method=6)
    print(f"{name:6s} {im.width}x{im.height}  {os.path.getsize(path) // 1024} KB")
