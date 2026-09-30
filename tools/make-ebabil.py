#!/usr/bin/env python3
"""Ebabil'i (assets/mascot/hero.png) animasyon katmanlarına böler: gövde, sol kanat, sağ kanat, kuyruk.

Yöntem: her parça orijinalin `M` maskesiyle çarpılmış hâli, gövde `1 - toplam(M)`. Tarayıcıda katmanlar `mix-blend-mode: plus-lighter`
ile TOPLANIR (önceden-çarpılmış renkte toplam) → dinlenme hâli orijinalle piksel piksel aynıdır; kanat döndüğünde kenar boyunca
yumuşak bir geçiş (kesik değil) oluşur.

Gereksinim: Pillow + numpy (sistem Python'unda yok → `python3 -m venv /tmp/v && /tmp/v/bin/pip install pillow numpy`).
Kullanım: python3 tools/make-ebabil.py  → vento/base/content/ebabil/*.webp (+ tools/ebabil-preview.png)
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets/mascot/hero.png")
OUT = os.path.join(ROOT, "vento/base/content/ebabil")
SIZE = 640          # çıktı kenarı (kaynak 1254); başlangıç görünümünde ~280 px gösterilir, 2x için yeter
FEATHER = 16        # maske yumuşatma (kaynak pikseli)

# Kaynak (1254x1254) piksel koordinatlarında parça çokgenleri. Elle, ızgaralı önizlemeden seçildi.
POLYS = {
    # büyük sol kanat: kesim çizgisi omuzdan (kafanın solundan) aşağıda kuyruk yaprağının üstüne kadar
    "wing-l": [(0, 0), (742, 0), (742, 560), (712, 640), (650, 706), (560, 752), (470, 742), (380, 706), (0, 706)],
    # kafanın arkasındaki sağ kanat: gaganın sağından başlar (kafa/gaga gövdede kalır)
    "wing-r": [(1024, 120), (1254, 120), (1254, 780), (1040, 780), (980, 720), (990, 650), (1030, 580), (1032, 515), (1024, 440)],
    # çatallı kuyruk: kanat kesiminin altından gövdenin altına
    "tail": [(0, 760), (470, 760), (560, 790), (640, 850), (700, 910), (620, 980), (420, 1200), (0, 1200)],
}
PIVOTS = {"wing-l": (700, 650), "wing-r": (985, 640), "tail": (640, 860), "body": (700, 690)}  # CSS transform-origin için


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
    # gövde: toplam maskenin tümleyeni; bölgeler üst üste binerse (<1) fazla toplam kırpıldığı için oran korunur
    scale = np.where(total > 1e-6, np.clip(sum(ms.values()), 0, 1) / np.maximum(sum(ms.values()), 1e-6), 0)
    body = a.copy()
    body[..., 3] = a[..., 3] * (1 - total)
    layers["body"] = body
    # Sağ kanat gövdenin ARKASINDA, sol kanat ve kuyruk önünde; sıra CSS'te
    os.makedirs(OUT, exist_ok=True)
    for k, arr in layers.items():
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)
        img.save(os.path.join(OUT, f"{k}.webp"), "WEBP", quality=90, method=6)
    Image.fromarray(a.astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, "still.webp"), "WEBP", quality=90, method=6)

    # Doğrulama: katmanları önceden-çarpılmış toplayıp orijinalle karşılaştır
    def premult(x):
        p = x.copy(); p[..., :3] *= p[..., 3:4] / 255.0; return p
    rest = sum(premult(layers[k]) for k in layers)
    orig = premult(a)
    diff = np.abs(rest - orig)
    print(f"dinlenme hâli farkı: maks {diff.max():.2f}, ortalama {diff.mean():.4f} (0-255 ölçeğinde)")
    assert diff.max() <= 1.0, "katmanların toplamı orijinalle aynı değil: maskeler tutarsız"
    # Önizleme: kanat uç noktalarında (±5°) toplamsal birleşim
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
    print("katmanlar:", ", ".join(sorted(os.listdir(OUT))))


if __name__ == "__main__":
    main()
