#!/usr/bin/env python3
"""The pass-8 acceptance cut: a perpendicular section through the seam.

pass7_measure.profile averages along a PCA axis fitted to a rectangle. Where the seam
sits against a bright specular flank the rectangle's PCA tilts into the flank and the
"profile" comes back flat. This one follows the seam instead: for every row it takes
the centroid of the warm pixels, so the band's own ridge gives the tangent, and the cut
is taken square to that tangent at the row where the band is widest.

Reports, in luminance (sRGB 0-255):

  metal L / R      median of the outer samples each side of the seam
  throat           the deepest sample between the metal and the core, and how far it
                   falls below the *lower* of the two metal readings
  core             peak, and the width of the contiguous run above L 100 that contains it
  bands            metal / throat / core / metal as four numbers, left to right

  python3 tools/pass8_seam.py <png> [--x0 .. --x1 .. --y0 .. --y1 ..] [--half 30]
"""
import sys
import numpy as np
from PIL import Image

K = np.array([0.2126, 0.7152, 0.0722], np.float32)


def bilin(img, xs, ys):
    x0 = np.floor(xs).astype(int); y0 = np.floor(ys).astype(int)
    fx = xs - x0; fy = ys - y0
    h, w = img.shape
    x0 = np.clip(x0, 0, w - 2); y0 = np.clip(y0, 0, h - 2)
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def main(png, x0=820, x1=1340, y0=250, y1=520, half=30.0):
    a = np.asarray(Image.open(png).convert('RGB')).astype(np.float32)
    L = a @ K
    warm = a[..., 0] - a[..., 2]
    sub = np.zeros(L.shape, bool)
    sub[y0:y1, x0:x1] = True
    m = (warm > 40) & (L > 90) & sub

    ridge = {}
    counts = {}
    for y in range(y0, y1):
        xs = np.nonzero(m[y])[0]
        if len(xs) >= 2:
            ridge[y] = float(xs.mean())
            counts[y] = len(xs)
    if not ridge:
        print(f'{png}: no seam in window')
        return
    ys = sorted(ridge)
    # widest row, then widen until it is a real band and not a 3 px hot spot
    ystar = max(counts, key=counts.get)
    if min(ys) + 1 < ystar < max(ys) - 1:
        dxdy = (ridge[ystar + 1] - ridge[ystar - 1]) / 2.0
    else:
        dxdy = 0.0
    tl = np.hypot(1.0, dxdy)
    nx, ny = 1.0 / tl, -dxdy / tl          # unit normal to the ridge

    # average the cut over +-8 rows, following the ridge
    acc = np.zeros(0)
    offs = np.arange(-half, half + 0.001, 0.5)
    stack = []
    for dy in range(-8, 9):
        y = ystar + dy
        if y not in ridge:
            continue
        cx = ridge[y]
        # offset s moves along the normal: (nx, ny), both in pixels
        px = cx + offs * nx
        py = y + offs * ny
        stack.append(bilin(L, px, py))
    prof = np.mean(stack, axis=0)
    peak_i = int(np.argmax(prof))

    # metal = outer thirds on each side
    edge = int(len(offs) * 0.20)
    metal_l = float(np.median(prof[:edge]))
    metal_r = float(np.median(prof[-edge:]))

    # throat = minimum between the left edge and the core's left shoulder
    lo = 0
    hi = peak_i
    # walk left from the peak while still descending (the shoulder), then find the min
    j = peak_i
    while j > 0 and prof[j - 1] < prof[j] + 1e-6:
        j -= 1
    throat_i = int(np.argmin(prof[edge:max(j, edge + 1)])) + edge if j > edge else edge
    throat = float(prof[throat_i])
    dip = min(metal_l, metal_r) - throat

    # core width: contiguous run above 100 containing the peak
    thr = 100.0
    i0 = peak_i
    while i0 > 0 and prof[i0 - 1] > thr:
        i0 -= 1
    i1 = peak_i
    while i1 < len(prof) - 1 and prof[i1 + 1] > thr:
        i1 += 1
    core_w = float(offs[i1] - offs[i0]) if prof[peak_i] > thr else 0.0

    print(f'{png}  y*={ystar}  ridge x={ridge[ystar]:.0f}  tangent {np.degrees(np.arctan2(1, dxdy)):.1f} deg from +x')
    print(f'  metal L/R     {metal_l:6.1f} / {metal_r:6.1f}')
    print(f'  throat        {throat:6.1f} at {offs[throat_i]:+.1f} px   (dip below lower metal {dip:.1f})')
    print(f'  core peak     {prof[peak_i]:6.1f} at {offs[peak_i]:+.1f} px')
    print(f'  core > 100    {core_w:.1f} px  ({offs[i0]:+.1f} .. {offs[i1]:+.1f})')
    print(f'  bands  metal {metal_l:.0f} | throat {throat:.0f} | core {prof[peak_i]:.0f} | metal {metal_r:.0f}')
    print('  profile:', ' '.join(f'{o:+.0f}:{v:.0f}' for o, v in zip(offs[::4], prof[::4])))


if __name__ == '__main__':
    kw = {}
    pos = []
    i = 1
    while i < len(sys.argv):
        if sys.argv[i].startswith('--'):
            kw[sys.argv[i][2:]] = float(sys.argv[i + 1]) if '.' in sys.argv[i + 1] else int(sys.argv[i + 1])
            i += 2
        else:
            pos.append(sys.argv[i]); i += 1
    main(pos[0], **kw)
