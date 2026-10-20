#!/usr/bin/env python3
"""Find the seam in a hero frame and cut across it, without a hand-picked window.

The seam is the only warm, bright thing on the body, so the band is found from the
frame: warm (r-b>45), lit (L>110), inside the body box, above the plinth. The widest
screen row of that mask is where the channel is widest; the window handed to
pass8_measure.profile is that row +/- 10 px, so the PCA sees the band and nothing else.

  python3 tools/pass8_auto.py <png> [--x0 820 --x1 1340 --y0 200 --y1 700]
"""
import subprocess
import sys
import numpy as np
from PIL import Image

K = np.array([0.2126, 0.7152, 0.0722], np.float32)


def main(png, x0=820, x1=1340, y0=200, y1=700):
    a = np.asarray(Image.open(png).convert('RGB')).astype(np.float32)
    L = a @ K
    warm = a[..., 0] - a[..., 2]
    win = np.zeros(L.shape, bool)
    win[y0:y1, x0:x1] = True
    m = (warm > 45) & (L > 110) & win
    ys, xs = np.nonzero(m)
    if len(xs) < 50:
        print(f'{png}: no seam found in {x0}..{x1} x {y0}..{y1}')
        return
    rows = np.bincount(ys, minlength=L.shape[0])
    ry = int(np.argmax(rows[y0:y1])) + y0
    sel = ys == ry
    bx0, bx1 = int(xs[sel].min()), int(xs[sel].max())
    bys = ys[(ys > ry - 60) & (ys < ry + 60)]
    print(f'{png}: seam {len(xs)} px, y {ys.min()}..{ys.max()}, widest row y={ry} '
          f'x {bx0}..{bx1} ({bx1 - bx0 + 1} warm px)')
    args = [sys.executable, 'tools/pass8_measure.py', 'profile', png,
            '--x0', str(bx0 - 12), '--x1', str(bx1 + 12),
            '--y0', str(ry - 10), '--y1', str(ry + 10)]
    out = subprocess.run(args, capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith('   ') and not line.startswith('      ') or line.startswith('    perpendicular values'):
            print(line)
        if line.startswith('    perpendicular values') or line.startswith('      '):
            pass
    # the full perpendicular series, one row per line, so the structure can be read
    grab = False
    for line in out.splitlines():
        if 'perpendicular values' in line:
            grab = True
            continue
        if grab:
            if not line.startswith('      '):
                break
            print(line)


if __name__ == '__main__':
    kw = {}
    pos = []
    i = 1
    while i < len(sys.argv):
        if sys.argv[i].startswith('--'):
            kw[sys.argv[i][2:]] = int(sys.argv[i + 1]); i += 2
        else:
            pos.append(sys.argv[i]); i += 1
    main(pos[0], **kw)
