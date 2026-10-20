#!/usr/bin/env python3
"""The six numbers the report quotes, off one frame. Prints its working."""
import sys
import numpy as np
from PIL import Image

def load(p):
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    return a, a @ np.array([0.2126, 0.7152, 0.0722], np.float32), a[..., 0] - a[..., 2]

def main(path, x0, x1, y0, y1):
    a, L, ch = load(path)
    win = np.zeros(L.shape, bool); win[y0:y1, x0:x1] = True
    warm = (ch > 40) & (L > 60) & win
    ys, xs = np.nonzero(warm)
    print(f'{path}  window x{x0}-{x1} y{y0}-{y1}')
    if len(xs) < 30:
        print('  NO CORE'); return
    c = np.array([xs.mean(), ys.mean()])
    P = np.stack([xs, ys], 1) - c
    w, v = np.linalg.eigh(np.cov(P.T))
    ax = v[:, int(np.argmax(w))]
    t = P @ ax
    n = P @ np.array([-ax[1], ax[0]])
    ln = np.ptp(t)
    print(f'  core area {len(xs)} px, axis ({ax[0]:+.2f},{ax[1]:+.2f}) = '
          f'{np.degrees(np.arctan2(ax[1], ax[0])):+.0f} deg, length {ln:.0f} px')
    print(f'  CORE WIDTH {len(xs) / max(ln, 1):.1f} px (area / length, perpendicular)')
    # body reference: the same rows, 18-34 px outside the core's own x extent
    core_x0, core_x1 = int(xs.min()), int(xs.max())
    ref = np.concatenate([L[y0:y1, max(0, core_x0 - 34):max(0, core_x0 - 18)].ravel(),
                          L[y0:y1, core_x1 + 18:core_x1 + 34].ravel()])
    ref = ref[ref > 40]
    body = float(np.median(ref)) if len(ref) else 0.0
    print(f'  body reference L {body:.0f} (median of {len(ref)} px either side)')
    # walk across the band on its normal, through the centroid, and tabulate
    prof = []
    for tv in np.arange(-26, 26, 1.0):
        px = c + ax * tv if False else c + np.array([-ax[1], ax[0]]) * tv
        xi, yi = int(round(px[0])), int(round(px[1]))
        if 0 <= yi < L.shape[0] and 0 <= xi < L.shape[1]:
            prof.append((tv, L[yi, xi], ch[yi, xi], a[yi, xi]))
    ts = np.array([p[0] for p in prof]); Ls = np.array([p[1] for p in prof])
    inside = np.abs(ts) <= len(xs) / max(ln, 1) / 2
    print('   t(px)   L   r-b   rgb')
    for tv, l, cc, col in prof:
        mark = 'CORE' if abs(tv) <= len(xs) / max(ln, 1) / 2 else ''
        if int(round(tv)) % 2 == 0 and abs(tv) <= 20:
            print(f'  {tv:+6.1f} {l:4.0f} {cc:+5.0f}  ({col[0]:3.0f},{col[1]:3.0f},{col[2]:3.0f})  {mark}')
    dark = Ls[~inside]
    half = int(len(ts) // 2)
    print(f'  darkest outside the core within 26 px: {dark.min():.0f} L '
          f'({100 * dark.min() / max(body, 1):.0f} % of body)')
    lipp = dark.max()
    print(f'  brightest outside the core within 26 px: {lipp:.0f} L '
          f'(body +{lipp - body:.0f})')
    # plateaus along the normal: the banding check, at 1:1 on a known gradient
    q = np.round(Ls).astype(int)
    run = best = 1
    for d in np.diff(q):
        run = run + 1 if d == 0 else 1
        best = max(best, run)
    print(f'  longest identical-code run across the section: {best} px')

if __name__ == '__main__':
    p = sys.argv[1]
    x0, x1, y0, y1 = [int(v) for v in (sys.argv[2:6] if len(sys.argv) > 5 else (0, 0, 0, 0))]
    if len(sys.argv) > 5:
        main(p, x0, x1, y0, y1)
    else:
        main(p, 0, Image.open(p).size[0], 0, Image.open(p).size[1])
