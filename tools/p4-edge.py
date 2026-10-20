"""Pass 4: the silhouette edge, measured the only way that is not a matter of opinion.

The frames are the isolated captures from tools/p4-silhouette.mjs: the column on a dark
ground, no wall spill, no copy, same camera and same rest pose in both builds. For each
row, on the column's left silhouette:

  bg      = the level well to the left of the column
  peak    = the brightest level inside the first ~14 px of the column (its lit rim)
  cover_i = clip((I_i - bg) / (peak - bg), 0, 1) — how much geometry covers pixel i

  partial = pixels between the ground and the rim whose coverage is neither ~0 nor ~1.
            Those are the pixels the sampling had to decide about: a resolved edge has
            about one per row, a blurred edge has two or three.
  spread  = sum(1 - cover) from the last ground pixel up to the rim. Blur adds to this.
  x       = the coverage-weighted sub-pixel position of the edge. On an aliased edge the
            coverage is 0 or 1, so x can only land on whole pixels and jumps between
            rows; on a resolved edge it moves continuously. jitter = std of its first
            difference, in CSS px.

usage: p4-edge.py [out.json]
"""
import json
import sys
import numpy as np
from PIL import Image

ROWS = range(140, 830, 2)
WIN = (806, 960)          # CSS px around the column's left silhouette: no text, no spill


def measure(path, dpr):
    grey = np.asarray(Image.open(path).convert('L')).astype(float)
    x0, x1 = int(WIN[0] * dpr), int(WIN[1] * dpr)
    partials, spreads, xs = [], [], []
    for y in ROWS:
        row = grey[int(y * dpr)][x0:x1]
        if len(row) < 40:
            continue
        bg = float(np.median(row[:30]))
        lit = np.nonzero(row > bg + 8)[0]
        if not len(lit):
            continue
        i0 = int(lit[0])                                  # first pixel off the ground
        peak = float(row[i0:i0 + 14].max())
        if peak - bg < 25:
            continue
        seg = row[max(0, i0 - 2):i0 + 14]
        cover = np.clip((seg - bg) / (peak - bg), 0, 1)
        ipeak = int(np.argmax(cover))
        lead = cover[:ipeak + 1]
        # Only the first 6 device pixels past the ground: past that it is the metal's own
        # shading ramp, which is not what sampling decides. The sharpest step in that
        # window, as a fraction of the whole ground-to-rim rise, is the edge's crispness:
        # 1.0 is a single-pixel jump, 0.33 is the same rise smeared over three pixels.
        edge = cover[:6]
        steps = np.diff(edge) if len(edge) > 1 else np.array([0.0])
        partials.append(float(np.max(steps)) if len(steps) else 0.0)
        spreads.append(float(np.count_nonzero((lead > 0.05) & (lead < 0.95))))
        xs.append(float(np.sum(edge * np.arange(len(edge))) / max(1e-6, np.sum(edge))) / dpr)
    if len(partials) < 20:
        return None
    xs = np.array(xs)
    d = np.diff(xs)
    return {
        'rows': len(partials),
        'sharpestStepFraction_median': round(float(np.median(partials)), 2),
        'partialPixelsPerRow_median': int(np.median(spreads)),
        'edgePositionJitterPx': round(float(np.std(d)), 3),
    }


def slot_edge(path, dpr):
    """The emitter slot: the one edge in the frame that is diagonal, high contrast and
    emissive, so it is where aliasing actually shows. Uses the warm channel (r - b) to
    separate the emitter from the metal behind it."""
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(float)
    x0, x1 = int(1000 * dpr), int(1140 * dpr)
    steps, partials, xs = [], [], []
    for y in range(380, 520):
        row = rgb[int(y * dpr)][x0:x1]
        m = row[:, 0] - row[:, 2]
        bgm = float(np.median(m[:12]))
        peak = float(m.max())
        if peak - bgm < 30:
            continue
        cover = np.clip((m - bgm) / (peak - bgm), 0, 1)
        lit = np.nonzero(cover > 0.5)[0]
        if not len(lit):
            continue
        i0 = int(lit[0])
        ramp = cover[max(0, i0 - 5):i0 + 2]
        step = np.diff(ramp)
        steps.append(float(np.max(step)) if len(step) else 0.0)
        partials.append(int(np.count_nonzero((ramp > 0.05) & (ramp < 0.95))))
        xs.append(float(np.sum(ramp * np.arange(len(ramp))) / max(1e-6, np.sum(ramp))) / dpr)
    if len(steps) < 20:
        return None
    xs = np.array(xs)
    return {
        'rows': len(steps),
        'sharpestStepFraction_median': round(float(np.median(steps)), 2),
        'partialPixelsPerRow_median': int(np.median(partials)),
        'edgePositionJitterPx': round(float(np.std(np.diff(xs))), 3),
    }


FRAMES = [
    ('before_dpr1', 'docs/pass4/sil/before-dpr1.png', 1),
    ('after_dpr1', 'docs/pass4/sil/after-dpr1.png', 1),
    ('before_dpr2', 'docs/pass4/sil/before-dpr2.png', 2),
    ('after_dpr2', 'docs/pass4/sil/after-dpr2.png', 2),
]

out = {}
for name, path, dpr in FRAMES:
    try:
        out[name] = {'dpr': dpr, 'leftSilhouette': measure(path, dpr), 'slotEdge': slot_edge(path, dpr)}
    except FileNotFoundError:
        out[name] = {'missing': path}

print(json.dumps(out, indent=1))
open(sys.argv[1] if len(sys.argv) > 1 else 'docs/pass4/sil/edges.json', 'w').write(json.dumps(out, indent=1))
