#!/usr/bin/env python3
"""Generates the Vento document icon (document.icns) and disk icon (disk.icns).

Document: dark "ink" paper, folded top-right corner, Vento's V wind mark in the middle (extracted from the app icon).
Requires Pillow + numpy (venv) and macOS `iconutil`. Usage: python3 tools/make-doc-icon.py
"""
import os, subprocess, tempfile, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = os.path.join(ROOT, "vento/branding/default")
S = 2048  # supersampling canvas (downscaled to 1024)

# V mark: taken from the app icon (gradient strokes on a dark background); alpha comes from the distance to the background color
src_icon = Image.open(os.path.join(ROOT, "assets/logo-vento-1024.png")).convert("RGB").resize((1024, 1024), Image.LANCZOS)
rgb = np.asarray(src_icon, dtype=np.float32)
bg = np.array([18, 18, 22], dtype=np.float32)
dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
alpha = np.clip((dist - 40) / 90, 0, 1)
mark = np.dstack([rgb, alpha * 255]).astype(np.uint8)
ys, xs = np.where(alpha > 0.1)
mark_img = Image.fromarray(mark).crop((xs.min(), ys.min(), xs.max(), ys.max()))

def sheet(size=S):
    W = H = size
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # paper: 62% width, 80% height, centered; top-right corner folded
    pw, ph = int(W * 0.64), int(H * 0.80)
    x0, y0 = (W - pw) // 2, int(H * 0.10)
    x1, y1 = x0 + pw, y0 + ph
    r = int(W * 0.05)
    fold = int(W * 0.17)
    # body mask (folded corner cut off); the shadow is built from the SAME shape
    body = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(body)
    d.rounded_rectangle((x0, y0, x1, y1), r, fill=255)
    d.polygon([(x1 - fold, y0 - 2), (x1 + 2, y0 - 2), (x1 + 2, y0 + fold)], fill=0)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow.putalpha(body.point(lambda v: 120 if v > 0 else 0))
    shadow = shadow.transform(shadow.size, Image.AFFINE, (1, 0, 0, 0, 1, -int(H * 0.012)))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(W * 0.018)))
    grad = np.zeros((H, W, 4), dtype=np.float32)
    t = np.linspace(0, 1, H)[:, None]
    top = np.array([28, 32, 44]); bot = np.array([14, 15, 20])
    for c in range(3):
        grad[..., c] = (top[c] * (1 - t) + bot[c] * t)
    grad[..., 3] = 255
    paper = Image.fromarray(grad.astype(np.uint8))
    paper.putalpha(body)
    # thin edge line
    edge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle((x0, y0, x1, y1), r, outline=(90, 130, 190, 90), width=max(2, W // 512))
    edge.putalpha(Image.fromarray((np.asarray(edge)[..., 3].astype(np.float32) * (np.asarray(body) > 0)).astype(np.uint8)))
    img.alpha_composite(paper); img.alpha_composite(edge)
    # folded corner: triangle with a light blue-to-turquoise gradient
    fd = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(fd).polygon([(x1 - fold, y0), (x1 - fold, y0 + fold), (x1, y0 + fold)], fill=(64, 160, 240, 255))
    fg = np.asarray(fd).copy()
    gx = np.linspace(0, 1, W)[None, :]
    fg[..., 0] = np.where(fg[..., 3] > 0, 64 + (32 - 64) * gx, 0)
    fg[..., 1] = np.where(fg[..., 3] > 0, 160 + (224 - 160) * gx, 0)
    fg[..., 2] = np.where(fg[..., 3] > 0, 240 + (208 - 240) * gx, 0)
    img.alpha_composite(Image.fromarray(fg.astype(np.uint8)))
    # V mark
    mw = int(pw * 0.62)
    m = mark_img.resize((mw, int(mw * mark_img.height / mark_img.width)), Image.LANCZOS)
    img.alpha_composite(m, (x0 + (pw - m.width) // 2, y0 + int(ph * 0.55) - m.height // 2))
    return img.resize((1024, 1024), Image.LANCZOS)

def make_icns(base, out):
    tmp = tempfile.mkdtemp(suffix=".iconset")
    for sz in (16, 32, 128, 256, 512):
        base.resize((sz, sz), Image.LANCZOS).save(os.path.join(tmp, f"icon_{sz}x{sz}.png"))
        base.resize((sz * 2, sz * 2), Image.LANCZOS).save(os.path.join(tmp, f"icon_{sz}x{sz}@2x.png"))
    subprocess.check_call(["iconutil", "-c", "icns", tmp, "-o", out])
    shutil.rmtree(tmp)

doc = sheet()
doc.save(os.path.join(ROOT, "tools/doc-icon-preview.png"))
make_icns(doc, os.path.join(BRAND, "document.icns"))
print("document.icns:", os.path.getsize(os.path.join(BRAND, "document.icns")) // 1024, "KB")
shutil.copyfile(os.path.join(BRAND, "firefox.icns"), os.path.join(BRAND, "disk.icns"))
print("disk.icns = app icon")
