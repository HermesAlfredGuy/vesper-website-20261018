#!/usr/bin/env python3
"""Measured facts about one hero frame. Text in, text out.

  python3 tools/m5.py hero.png mask.png [--label before]

hero.png  the shipped hero, 2x render; this tool Lanczos-downscales it to 1440x900
          (the established proof method), then measures at 1:1.
mask.png  the same framing with only the shell + emitter drawn on pure magenta,
          so body pixels are named by the framebuffer rather than guessed.

Reports, over the body mask only:
  p50 / p90 luminance (0-255 sRGB), share of body pixels under L40,
  the aperture's bright-run width in px (measured across the slot, not projected),
  and the row-luminance spectrum of a 24 px wide strip (banding check).
"""
import sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
argv = sys.argv[1:]
label = argv[argv.index('--label') + 1] if '--label' in argv else 'frame'
args = []
i = 0
while i < len(argv):
    if argv[i] == '--label':
        i += 2
        continue
    if not argv[i].startswith('--'):
        args.append(argv[i])
    i += 1
hero_p, mask_p = args[0], args[1]

W, H = 1440, 900
hero = Image.open(hero_p).convert('RGB')
if hero.size != (W, H):
    hero = hero.resize((W, H), Image.LANCZOS)
mask = Image.open(mask_p).convert('RGB').resize((W, H), Image.NEAREST)

a = np.asarray(hero).astype(np.float32) / 255.0
m = np.asarray(mask).astype(np.float32) / 255.0
# the mask frame is the shell + emitter on pure magenta (r,b high, g near zero)
magenta = (m[..., 0] > 0.85) & (m[..., 2] > 0.85) & (m[..., 1] < 0.25)
body = ~magenta
# interior of the object only: drop the 2 px anti-aliased silhouette ring
def erode(m, it=2):
    for _ in range(it):
        m = (m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
        m[:1, :] = m[-1:, :] = False
        m[:, :1] = m[:, -1:] = False
    return m
body = erode(body, 2)

lum = (a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)) * 255.0
vals = lum[body]
p50, p90 = np.percentile(vals, 50), np.percentile(vals, 90)
under40 = 100.0 * float((vals < 40).mean())
ys, xs = np.where(body)
box = (xs.min(), ys.min(), xs.max(), ys.max())

out = {
    'label': label,
    'bodyPx': int(body.sum()),
    'bodyBox': [int(v) for v in box],
    'p50': round(float(p50), 1),
    'p90': round(float(p90), 1),
    'underL40pct': round(under40, 1),
    'mean': round(float(vals.mean()), 1),
}

# ---- aperture: the bright run, measured across the slot ------------------------
# A pixel belongs to the opening if it is warmer and brighter than the metal either
# side of it. Search the body box for rows with a strong local amber peak.
r, g, b = a[..., 0] * 255, a[..., 1] * 255, a[..., 2] * 255
warm = (r - b) > 25
cand = warm & body
best_run = {'px': 0, 'x': 0, 'y': 0, 'peak': 0}
for y in range(box[1], box[3] + 1):
    row = cand[y, box[0]:box[2] + 1]
    if not row.any():
        continue
    # longest contiguous run in this row
    idx = np.where(row)[0]
    splits = np.where(np.diff(idx) > 1)[0]
    for seg in np.split(idx, splits + 1):
        if len(seg) < 2:
            continue
        x0, x1 = seg[0], seg[-1]
        peak = float(lum[y, box[0] + x0: box[0] + x1 + 1].max())
        if peak - float(np.median(lum[y, max(0, box[0] + x0 - 6): box[0] + x1 + 7])) < 6:
            continue
        if peak > best_run['peak'] and len(seg) >= best_run['px'] * 0.5:
            best_run = {'px': int(len(seg)), 'x': int(box[0] + x0), 'y': int(y), 'peak': round(peak, 1)}
out['apertureRunPx'] = best_run

# ---- banding: row-luminance spectrum of a vertical strip of the body ----------
sx = int(box[0] + (box[2] - box[0]) * 0.42)
strip = lum[box[1] + 8: box[3] - 8, sx: sx + 24].mean(axis=1).astype(np.float64)
n = len(strip)
if n > 64:
    t = np.arange(n)
    coef = np.polyfit(t, strip, 3)
    d = strip - np.polyval(coef, t)
    d *= np.hanning(n)
    spec = np.abs(np.fft.rfft(d)) / (n * 0.5)
    freqs = np.fft.rfftfreq(n, 1.0)
    band = (freqs > 1 / 80.0) & (freqs < 0.5)      # periods 2..80 px
    k = np.argmax(spec[band])
    period = 1.0 / freqs[band][k]
    out['strip'] = {'x': int(sx), 'periodPx': round(float(period), 2),
                    'peakAmp': round(float(spec[band][k]), 2),
                    'rms': round(float(np.sqrt((d ** 2).mean())), 3)}
print(__import__('json').dumps(out, indent=1))
