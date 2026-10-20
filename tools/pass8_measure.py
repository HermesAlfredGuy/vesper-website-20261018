#!/usr/bin/env python3
"""Pass 8 acceptance measurements — the channel's cross-section, read off the frame.

Everything here is a number off a shipped PNG. Two profiles are reported:

  perp  the luminance cross-section perpendicular to the seam at its widest point,
        averaged along 24 px of the band, so an oblique crossing cannot inflate it.
        This is where the band widths are true.
  horiz the same cut along a screen row through the widest point, which is what the
        acceptance names. A row crosses a diagonal band at 1/sin(angle), so its runs
        are wider than the perpendicular ones by construction.

    python3 tools/pass8_measure.py profile <png> [--x0 900 --x1 1120 --y0 380 --y1 470]
    python3 tools/pass8_measure.py banding <png> --x0 .. --x1 .. --y0 .. --y1 ..
    python3 tools/pass8_measure.py height  <mask.png>
    python3 tools/pass8_measure.py patch   <a.png> <b.png>
"""
import sys
import numpy as np
from PIL import Image

K = np.array([0.2126, 0.7152, 0.0722], np.float32)


def load(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(np.float32)


def lum(a):
    return a @ K


def parse(argv):
    kw, pos = {}, []
    i = 0
    while i < len(argv):
        if argv[i].startswith('--'):
            k = argv[i][2:]
            if '=' in k:
                k, v = k.split('=', 1)
            else:
                v = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else '1'
            kw[k] = v
            i += 2 if '=' not in argv[i][2:] else 1
        else:
            pos.append(argv[i]); i += 1
    return kw, pos


def runs(mask, gap=1):
    idx = np.nonzero(mask)[0]
    if not len(idx):
        return []
    out, s, p = [], idx[0], idx[0]
    for x in idx[1:]:
        if x - p > gap:
            out.append((s, p + 1)); s = x
        p = x
    out.append((s, p + 1))
    return out


def band_report(prof, offs, label):
    """prof: luminance along the cut; offs: pixel offsets (may be float)."""
    n = len(prof)
    core_i = int(np.argmax(prof))
    peak = prof[core_i]
    # the core is the run of >100 that contains the peak, not any run of >100
    lo = core_i
    while lo > 0 and prof[lo - 1] > 100.0:
        lo -= 1
    hi = core_i
    while hi < n - 1 and prof[hi + 1] > 100.0:
        hi += 1
    core_px = hi - lo + 1
    k = max(3, n // 9)
    left_metal = float(np.median(prof[:k]))
    right_metal = float(np.median(prof[-k:]))
    lseg = prof[:max(1, lo)]
    rseg = prof[hi + 1:]
    dip_l = float(lseg.min()) if len(lseg) else float('nan')
    dip_r = float(rseg.min()) if len(rseg) else float('nan')
    li = int(np.argmin(lseg)) if len(lseg) else 0
    ri = hi + 1 + int(np.argmin(rseg)) if len(rseg) else n - 1
    print(f'  {label}')
    print(f'    metal L/R        {left_metal:6.1f} / {right_metal:6.1f}')
    print(f'    throat dip L/R   {dip_l:6.1f} / {dip_r:6.1f}   (below adjacent metal by '
          f'{left_metal - dip_l:5.1f} / {right_metal - dip_r:5.1f})')
    print(f'    core peak        {peak:6.1f} at offset {offs[core_i]:+.1f}')
    print(f'    core > 100       {core_px:3d} px  '
          f'(offsets {offs[lo]:+.1f} .. {offs[hi]:+.1f})')
    print(f'    dip offsets      {offs[li]:+.1f} / {offs[ri]:+.1f}')
    return dict(metal_l=left_metal, metal_r=right_metal, dip_l=dip_l, dip_r=dip_r,
                peak=float(peak), core_px=int(core_px),
                dip_l_delta=left_metal - dip_l, dip_r_delta=right_metal - dip_r)


def cmd_profile(png, kw):
    a = load(png)
    L = lum(a)
    x0 = int(kw.get('x0', 900)); x1 = int(kw.get('x1', 1140))
    y0 = int(kw.get('y0', 370)); y1 = int(kw.get('y1', 480))
    warm = a[..., 0] - a[..., 2]
    win = np.zeros(L.shape, bool)
    win[y0:y1, x0:x1] = True
    m = (warm > 22) & (L > 80) & win
    if m.sum() < 30:
        print('no warm band in window — widen --x0/--x1/--y0/--y1'); return
    ys, xs = np.nonzero(m)
    cy, cx = ys.mean(), xs.mean()
    # principal direction of the band
    X = np.stack([xs - cx, ys - cy], 1).astype(np.float32)
    C = X.T @ X / len(X)
    ev, evec = np.linalg.eigh(C)
    d = evec[:, np.argmax(ev)]              # along the band
    nvec = np.array([-d[1], d[0]])          # across it
    if nvec[1] < 0:
        nvec = -nvec                        # +ve goes down-screen
    ang = np.degrees(np.arctan2(d[1], d[0]))
    print(f'{png}: warm band, {m.sum()} px, centroid ({cx:.0f}, {cy:.0f}), '
          f'band direction {ang:+.1f} deg from +x')
    # perpendicular profile, averaged along 24 px of the band, bilinear samples
    span = np.arange(-26, 27)
    acc = []
    for t in np.linspace(-12, 12, 25):
        samp = []
        for s in span:
            px = cx + d[0] * t + nvec[0] * s
            py = cy + d[1] * t + nvec[1] * s
            ix, iy = int(round(px)), int(round(py))
            if 0 <= iy < L.shape[0] and 0 <= ix < L.shape[1]:
                samp.append(L[iy, ix])
            else:
                samp.append(np.nan)
        acc.append(samp)
    prof = np.nanmean(np.array(acc, np.float32), 0)
    band_report(prof, span.astype(float), 'perpendicular cut (averaged along the band)')
    print('    perpendicular values (offset: L):')
    for k in range(0, len(span), 13):
        print('      ' + ' '.join(f'{s:+3.0f}:{v:3.0f}' for s, v in zip(span[k:k + 13], prof[k:k + 13])))
    # horizontal row through the widest point of the warm band
    roww = np.array([np.count_nonzero(m[y]) for y in range(y0, y1)])
    ry = y0 + int(np.argmax(roww))
    print(f'    widest warm row  y={ry} ({roww.max()} warm px)')
    xr = np.arange(x0, x1)
    hp = L[ry, x0:x1]
    band_report(hp, xr - cx, f'horizontal row y={ry}')
    print('    row values (x from %d):' % x0)
    for k in range(0, x1 - x0, 40):
        seg = hp[k:k + 40]
        print('      x%4d ' % (x0 + k) + ' '.join(f'{v:3.0f}' for v in seg[::2]))


def cmd_banding(png, kw):
    a = load(png); L = lum(a)
    x0 = int(kw['x0']); x1 = int(kw['x1']); y0 = int(kw['y0']); y1 = int(kw['y1'])
    reg = np.round(L[y0:y1, x0:x1]).astype(np.int32)
    best = []
    for r in reg:
        cur = 1
        for i in range(1, len(r)):
            if r[i] == r[i - 1]:
                cur += 1
            else:
                best.append(cur); cur = 1
        best.append(cur)
    best = np.array(best)
    print(f'{png} rows {y0}-{y1} x {x0}-{x1}: median run {np.median(best):.0f}, '
          f'p90 {np.percentile(best, 90):.0f}, max {best.max()}')


def cmd_height(png):
    a = np.asarray(Image.open(png).convert('L')).astype(np.float32)
    ys, xs = np.nonzero(a > 8)
    print(f'{png}: silhouette x {xs.min()}..{xs.max()}, y {ys.min()}..{ys.max()}, '
          f'height {ys.max() - ys.min() + 1} px, width {xs.max() - xs.min() + 1} px')


def cmd_patch(pa, pb):
    a, b = load(pa), load(pb)
    out = {}
    for tag, im in (('a', a), ('b', b)):
        r = im[..., 0] - im[..., 2]
        m = (r > 22) & (lum(im) > 30)
        ys, xs = np.nonzero(m)
        out[tag] = (m.sum(), xs.mean(), ys.mean(), r[m].mean())
        print(f'{tag}: {m.sum()} px, centroid ({xs.mean():.1f}, {ys.mean():.1f}), mean r-b {r[m].mean():+.1f}')
    print(f'centroid shift {(out["b"][1] - out["a"][1]):+.1f}, {(out["b"][2] - out["a"][2]):+.1f} px; '
          f'area {out["b"][0] - out["a"][0]:+d} px')


if __name__ == '__main__':
    kw, pos = parse(sys.argv[1:])
    cmd = pos[0]
    {'profile': lambda: cmd_profile(pos[1], kw),
     'banding': lambda: cmd_banding(pos[1], kw),
     'height': lambda: cmd_height(pos[1]),
     'patch': lambda: cmd_patch(pos[1], pos[2])}[cmd]()
