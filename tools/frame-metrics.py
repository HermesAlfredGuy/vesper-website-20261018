#!/usr/bin/env python3
"""Measured numbers off a captured frame. Text in, text out: no shader knows what it looks like.

  python3 tools/frame-metrics.py <prefix> [--band 0.10,0.45] [--hot 0.62]

<prefix>.scene.png is the render with the UI hidden, <prefix>.id.png is the flat-magenta
object (so body pixels are named, not guessed), <prefix>.planes.png says which pixels are
floor and which are wall.

Reports: floor p99 / p99.9, the blown area, the body's mid-tone a*/b* (CIE Lab, D65),
and the share of floor pixels at or above the clip point.
"""
import sys, json
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

prefix = sys.argv[1]
band = (0.10, 0.45)
hot = 0.62
args = sys.argv[2:]
while args:
    a = args.pop(0)
    if a == '--band':
        band = tuple(float(v) for v in args.pop(0).split(','))
    elif a == '--hot':
        hot = float(args.pop(0))

def load(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255.0

scene = load(prefix + '.scene.png')
idf = load(prefix + '.id.png')
planes = load(prefix + '.planes.png')

lum = scene @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
obj = (idf[..., 0] - idf[..., 1] > 0.15) & (idf[..., 2] - idf[..., 1] > 0.15) & (idf[..., 0] > 0.2)
floor = (planes[..., 0] > 0.5) & ~obj
wall = (planes[..., 1] > 0.5) & ~obj

def srgb_to_lab(rgb):
    m = rgb > 0.04045
    lin = np.where(m, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    X = lin[..., 0] * 0.4124 + lin[..., 1] * 0.3576 + lin[..., 2] * 0.1805
    Y = lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722
    Z = lin[..., 0] * 0.0193 + lin[..., 1] * 0.1192 + lin[..., 2] * 0.9505
    Xn, Yn, Zn = 0.95047, 1.0, 1.08883
    def f(t):
        return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
    fx, fy, fz = f(X / Xn), f(Y / Yn), f(Z / Zn)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)

out = {'prefix': prefix, 'frame': list(scene.shape[1::-1])}

H, W = lum.shape
out['object_px'] = int(obj.sum())
out['floor_px'] = int(floor.sum())
out['wall_px'] = int(wall.sum())

if floor.sum():
    fl = lum[floor]
    out['floor_p99'] = round(float(np.percentile(fl, 99)), 4)
    out['floor_p999'] = round(float(np.percentile(fl, 99.9)), 4)
    out['floor_max'] = round(float(fl.max()), 4)
    out['floor_p50'] = round(float(np.percentile(fl, 50)), 4)
    for thr in (hot, 0.72, 0.85):
        m = floor & (lum >= thr)
        n = int(m.sum())
        e = {'px': n, 'pct_frame': round(100.0 * n / lum.size, 3), 'pct_floor': round(100.0 * n / floor.sum(), 3)}
        if n:
            ys, xs = np.nonzero(m)
            e['bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
            e['centroid'] = [int(xs.mean()), int(ys.mean())]
        out['floor_ge_%.2f' % thr] = e
    out['floor_clip_px'] = int((floor & (scene.max(axis=2) >= 0.988)).sum())

body = obj & (lum >= band[0]) & (lum <= band[1])
out['body_band'] = list(band)
out['body_band_px'] = int(body.sum())
if body.sum():
    L, A, B = srgb_to_lab(scene)
    out['body_L'] = round(float(np.median(L[body])), 2)
    out['body_a'] = round(float(np.median(A[body])), 2)
    out['body_b'] = round(float(np.median(B[body])), 2)
    out['body_a_iqr'] = [round(float(np.percentile(A[body], 25)), 2), round(float(np.percentile(A[body], 75)), 2)]
    out['body_b_iqr'] = [round(float(np.percentile(B[body], 25)), 2), round(float(np.percentile(B[body], 75)), 2)]
    out['body_rgb'] = [round(float(v), 4) for v in scene[body].mean(axis=0)]

ys, xs = np.nonzero(obj)
if len(xs):
    out['object_bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]

print(json.dumps(out, indent=2))
