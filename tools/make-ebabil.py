#!/usr/bin/env python3
"""Splits Ebabil (assets/mascot/hero.png) into animation layers: body, left wing, right wing, tail.

Method: each part is the original multiplied by its mask `M`; the body is `1 - sum(M)`. In the browser the layers are SUMMED with
`mix-blend-mode: plus-lighter` (sum in premultiplied color), so the resting pose matches the original pixel for pixel; when a wing
rotates, the edge blends smoothly instead of showing a hard cut.

Requires Pillow + numpy (not in the system Python; use `python3 -m venv /tmp/v && /tmp/v/bin/pip install pillow numpy`).
Usage: python3 tools/make-ebabil.py  -> vento/base/content/ebabil/*.webp (+ tools/ebabil-preview.png)
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets/mascot/hero.png")
OUT = os.path.join(ROOT, "vento/base/content/ebabil")
SIZE = 640          # output edge (source is 1254); shown at ~280 px on the start page, enough for 2x
FEATHER = 16        # mask feathering (source pixels)

# Part polygons in source (1254x1254) pixel coordinates. Picked by hand from a gridded preview.
POLYS = {
    # large left wing: the cut runs from the shoulder (left of the head) down to just above the tail leaf
    "wing-l": [(0, 0), (742, 0), (742, 560), (712, 640), (650, 706), (560, 752), (470, 742), (380, 706), (0, 706)],
    # right wing behind the head: starts right of the beak (head and beak stay on the body)
    "wing-r": [(1024, 120), (1254, 120), (1254, 780), (1040, 780), (980, 720), (990, 650), (1030, 580), (1032, 515), (1024, 440)],
    # forked tail: from below the wing cut to the bottom of the body
    "tail": [(0, 760), (470, 760), (560, 790), (640, 850), (700, 910), (620, 980), (420, 1200), (0, 1200)],
}
PIVOTS = {"wing-l": (700, 650), "wing-r": (985, 640), "tail": (640, 860), "body": (700, 690)}  # for CSS transform-origin


def mask(points):
    m = Image.new("L", (1254, 1254), 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(FEATHER)), dtype=np.float32) / 255.0


def main():
    im = Image.open(SRC).convert("RGBA")
    assert im.size == (1254, 1254), im.size
    a = np.asarray(im, dtype=np.float32)
    ms = {k: mask(v) for k, v in POLYS.items()}
    total = np.clip(sum(ms.values()), 0, 1)
    layers = {k: a.copy() for k in ms}
    for k, m in ms.items():
        layers[k][..., 3] = a[..., 3] * m
    # body: the complement of the total mask; if regions overlap (<1), the excess sum is clipped, so the ratio is preserved
    scale = np.where(total > 1e-6, np.clip(sum(ms.values()), 0, 1) / np.maximum(sum(ms.values()), 1e-6), 0)
    body = a.copy()
    body[..., 3] = a[..., 3] * (1 - total)
    layers["body"] = body
    # The right wing sits BEHIND the body, and the left wing and tail in front; the order is in CSS
    os.makedirs(OUT, exist_ok=True)
    for k, arr in layers.items():
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)
        img.save(os.path.join(OUT, f"{k}.webp"), "WEBP", quality=90, method=6)
    Image.fromarray(a.astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, "still.webp"), "WEBP", quality=90, method=6)

    # Check: sum the layers in premultiplied form and compare with the original
    def premult(x):
        p = x.copy(); p[..., :3] *= p[..., 3:4] / 255.0; return p
    rest = sum(premult(layers[k]) for k in layers)
    orig = premult(a)
    diff = np.abs(rest - orig)
    print(f"resting pose difference: max {diff.max():.2f}, mean {diff.mean():.4f} (on a 0-255 scale)")
    assert diff.max() <= 1.0, "layer sum does not match the original: masks are inconsistent"
    # Preview: additive composite with the wings at their extremes (±5°)
    def rot(arr, deg, pivot):
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).rotate(-deg, center=pivot, resample=Image.BICUBIC)
        return np.asarray(img, dtype=np.float32)
    frame = premult(layers["body"]) + premult(rot(layers["wing-l"], 5, PIVOTS["wing-l"])) + premult(rot(layers["wing-r"], -5, PIVOTS["wing-r"])) + premult(rot(layers["tail"], 2, PIVOTS["tail"]))
    frame[..., :3] = np.clip(frame[..., :3], 0, 255)
    bg = np.zeros_like(frame); bg[..., :3] = (40, 44, 52); bg[..., 3] = 255
    out = frame[..., :3] + bg[..., :3] * (1 - np.clip(frame[..., 3:4], 0, 255) / 255.0)
    left = orig[..., :3] + bg[..., :3] * (1 - orig[..., 3:4] / 255.0)
    both = np.concatenate([left, out], axis=1)
    Image.fromarray(np.clip(both, 0, 255).astype(np.uint8)).resize((1254, 627), Image.LANCZOS).save(os.path.join(ROOT, "tools/ebabil-preview.png"))
    print("layers:", ", ".join(sorted(os.listdir(OUT))))


if __name__ == "__main__":
    main()
