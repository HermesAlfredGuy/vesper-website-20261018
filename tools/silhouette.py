"""silhouette.py — read the outline of the object out of a masked silhouette render.

  python3 tools/silhouette.py <png> [object_height_mm]

The probe renders the shell alone in flat red on a pale background, so the edge is a
number and not an opinion. Prints the half-width every ~2 mm and the residual against
the profile the lathe was given, which is what says whether a "lumpy outline" is the
profile the designer drew or a mesh defect.
"""
import sys
import numpy as np
from PIL import Image

OUTER = [
    [0.0200, 0.0790], [0.0232, 0.0812], [0.0440, 0.0766], [0.0900, 0.0724],
    [0.1300, 0.0718], [0.1600, 0.0740], [0.1900, 0.0778], [0.2200, 0.0826],
    [0.2480, 0.0872], [0.2720, 0.0900], [0.2900, 0.0902], [0.3000, 0.0886],
    [0.3060, 0.0854], [0.3092, 0.0796], [0.3105, 0.0640], [0.3086, 0.0432],
    [0.3050, 0.0220], [0.3040, 0.0000],
]
XSCALE = 1.24


def prof_mm(y_mm):
    y = y_mm / 1000.0
    if y <= OUTER[0][0]:
        return OUTER[0][1] * XSCALE * 1000
    for i in range(len(OUTER) - 1):
        ya, ra = OUTER[i]
        yb, rb = OUTER[i + 1]
        if ya <= y <= yb:
            return (ra + (rb - ra) * (y - ya) / (yb - ya)) * XSCALE * 1000
    return OUTER[-1][1] * XSCALE * 1000


def main():
    path = sys.argv[1]
    height_mm = float(sys.argv[2]) if len(sys.argv) > 2 else 310.0
    a = np.asarray(Image.open(path).convert('RGB'), dtype=float)
    mask = (a[:, :, 0] > 90) & (a[:, :, 1] < 70) & (a[:, :, 2] < 70)
    ys, xs = np.where(mask)
    if len(ys) == 0:
        print('no object found'); return
    row_hi = ys.min()
    Y, L, R = [], [], []
    for y in range(ys.min(), ys.max() + 1):
        r = np.where(mask[y])[0]
        if len(r) < 3:
            continue
        Y.append(y); L.append(r.min()); R.append(r.max())
    Y = np.array(Y); L = np.array(L, float); R = np.array(R, float)
    span = Y.max() - Y.min()
    scale = height_mm / span
    print('%s  height %d px  %.4f mm/px' % (path.split('/')[-1], span, scale))
    print(' y_mm | measured | profile | resid')
    worst = 0.0
    prev = None
    resid = []
    for i in range(len(Y)):
        ymm = (Y[i] - Y.min()) * scale
        if ymm < 3 or ymm > height_mm - 3:
            continue
        mh = (R[i] - L[i]) / 2 * scale
        ph = prof_mm(ymm)
        resid.append((ymm, mh - ph))
    for ymm, d in resid[::7]:
        print('%6.1f | %8.2f | %7.2f | %+6.2f' % (ymm, prof_mm(ymm) + d, prof_mm(ymm), d))
    arr = np.array([d for _, d in resid])
    print('residual rms %.2f mm   max %.2f mm   min %.2f mm' %
          (float(np.sqrt((arr ** 2).mean())), float(arr.max()), float(arr.min())))


main()
